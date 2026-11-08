// Redis storage for the colony. Redis is scoped per subreddit install,
// so every subreddit gets its own colony automatically.
import { redis } from '@devvit/web/server';
import {
  capacityOf,
  dayOf,
  isRoleId,
  productionMultiplier,
  statusOf,
} from '../../shared/game';
import type { Colony, Player } from '../../shared/game';
import type { HallEntry, LeaderEntry, StateResponse } from '../../shared/api';
import { advance, migrateColony, newColony, newPlayer } from './sim';

const COLONY_KEY = 'colony';
const PLAYERS_KEY = 'players';
const leaderboardKey = (generation: number) => `leaderboard:${generation}`;
const votesKey = (generation: number, proposalId: number) =>
  `votes:${generation}:${proposalId}`;
const VOTE_TTL_SECONDS = 7 * 24 * 3600;
const RECORDS_KEY = 'records';
const BADGES_KEY = 'badges';

const parseColony = (raw: string | undefined, now: number): Colony | null => {
  if (!raw) return null;
  try {
    const parsed: Partial<Colony> = JSON.parse(raw);
    return migrateColony(
      { ...newColony(now, 1), ...parsed, tiles: parsed.tiles ?? [] },
      now
    );
  } catch {
    return null;
  }
};

type Mutation<T> = { save: boolean; value: T };

/**
 * Load the colony, catch up on missed ticks, apply `fn`, and save atomically.
 * Uses Redis WATCH/MULTI so two players acting at once can't overwrite each other.
 */
export const updateColony = async <T>(
  fn: (colony: Colony, now: number) => Mutation<T>
): Promise<{ colony: Colony; value: T }> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await redis.watch(COLONY_KEY);
    const now = Date.now();
    const existing = parseColony(await redis.get(COLONY_KEY), now);
    const colony = existing ?? newColony(now, 1);
    const ticked = advance(colony, now);
    const { save, value } = fn(colony, now);

    if (!save && !ticked && existing) {
      await tx.unwatch();
      return { colony, value };
    }

    await tx.multi();
    await tx.set(COLONY_KEY, JSON.stringify(colony));
    const result = await tx.exec();
    if (Array.isArray(result) && result.length > 0) return { colony, value };
    // Someone else wrote first — retry with fresh data.
  }
  throw new Error('Colony is busy, please try again');
};

export const getPlayer = async (
  username: string,
  generation: number
): Promise<Player> => {
  const raw = await redis.hGet(PLAYERS_KEY, username);
  if (!raw) return newPlayer(generation);
  try {
    const parsed: Partial<Player> = JSON.parse(raw);
    const player: Player = { ...newPlayer(generation), ...parsed };
    if (!isRoleId(player.role)) player.role = null;
    // A new colony generation resets stats but keeps the chosen role.
    if (player.generation !== generation)
      return { ...newPlayer(generation), role: player.role };
    return player;
  } catch {
    return newPlayer(generation);
  }
};

export const savePlayer = async (
  username: string,
  player: Player
): Promise<void> => {
  await redis.hSet(PLAYERS_KEY, { [username]: JSON.stringify(player) });
};

export const addScore = async (
  username: string,
  generation: number,
  points: number
): Promise<void> => {
  await redis.zIncrBy(leaderboardKey(generation), username, points);
};

export const getLeaders = async (
  generation: number
): Promise<LeaderEntry[]> => {
  const rows = await redis.zRange(leaderboardKey(generation), 0, 4, {
    by: 'rank',
    reverse: true,
  });
  if (rows.length === 0) return [];
  const badges = await redis.hMGet(
    BADGES_KEY,
    rows.map((r) => r.member)
  );
  return rows.map((r, i) => ({
    username: r.member,
    score: r.score,
    badges: Number(badges[i] ?? 0) || 0,
  }));
};

/** The Great Hive is done: badge everyone who worked this colony, and record it. */
export const awardVictory = async (colony: Colony): Promise<void> => {
  const workers = await redis.zRange(leaderboardKey(colony.generation), 0, -1, {
    by: 'rank',
  });
  await Promise.all(workers.map((w) => redis.hIncrBy(BADGES_KEY, w.member, 1)));
  const entry: HallEntry = {
    generation: colony.generation,
    days: dayOf(colony),
    at: colony.wonderDoneAt ?? Date.now(),
  };
  await redis.hSet(RECORDS_KEY, {
    [String(colony.generation)]: JSON.stringify(entry),
  });
};

export const getRecords = async (): Promise<HallEntry[]> => {
  const all = await redis.hGetAll(RECORDS_KEY);
  const out: HallEntry[] = [];
  for (const raw of Object.values(all)) {
    try {
      const e: Partial<HallEntry> = JSON.parse(raw);
      if (
        typeof e.generation === 'number' &&
        typeof e.days === 'number' &&
        typeof e.at === 'number'
      ) {
        out.push({ generation: e.generation, days: e.days, at: e.at });
      }
    } catch {
      // skip bad rows
    }
  }
  return out.sort((a, b) => a.days - b.days || a.at - b.at).slice(0, 5);
};

const getBadges = async (username: string | null): Promise<number> =>
  username ? Number((await redis.hGet(BADGES_KEY, username)) ?? 0) || 0 : 0;

export const buildState = async (
  colony: Colony,
  username: string | null,
  playerOverride?: Player
): Promise<StateResponse> => {
  const proposal = colony.proposal;
  const [me, leaders, vote, records, myBadges] = await Promise.all([
    playerOverride ??
      (username
        ? getPlayer(username, colony.generation)
        : Promise.resolve(null)),
    getLeaders(colony.generation),
    username && proposal
      ? redis.hGet(votesKey(colony.generation, proposal.id), username)
      : Promise.resolve(undefined),
    getRecords(),
    getBadges(username),
  ]);
  return {
    type: 'state',
    serverNow: Date.now(),
    username,
    colony,
    status: statusOf(colony),
    capacity: capacityOf(colony),
    multiplier: productionMultiplier(colony),
    me,
    myVote: vote === 'yes' || vote === 'no' ? vote : null,
    leaders,
    records,
    myBadges,
  };
};

/** Record a vote once per user per proposal. Returns false if they already voted. */
export const claimVote = async (
  username: string,
  generation: number,
  proposalId: number,
  yes: boolean
): Promise<boolean> => {
  const key = votesKey(generation, proposalId);
  const added = await redis.hSetNX(key, username, yes ? 'yes' : 'no');
  if (added) await redis.expire(key, VOTE_TTL_SECONDS);
  return added === 1;
};

export const releaseVote = async (
  username: string,
  generation: number,
  proposalId: number
): Promise<void> => {
  await redis.hDel(votesKey(generation, proposalId), [username]);
};
