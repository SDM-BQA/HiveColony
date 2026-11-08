import { Hono } from 'hono';
import type { Context } from 'hono';
import { reddit } from '@devvit/web/server';
import {
  dayOf,
  staminaOf,
  getRole,
  isBuildable,
  isRoleId,
  statusOf,
} from '../../shared/game';
import type {
  ActionResponse,
  ErrorResponse,
  SplashResponse,
  StateResponse,
} from '../../shared/api';
import {
  addScore,
  awardVictory,
  buildState,
  claimVote,
  getPlayer,
  releaseVote,
  savePlayer,
  updateColony,
} from '../core/colony';
import { addLog, castVote, doShift, newColony } from '../core/sim';
import type { BuildOrder, ShiftResult } from '../core/sim';

export const api = new Hono();

const fail = (c: Context, message: string, status: 400 | 401 | 500 = 400) =>
  c.json<ErrorResponse>({ status: 'error', message }, status);

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const noop = { save: false, value: null };

// Full colony state for the game view.
api.get('/state', async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    const { colony } = await updateColony(() => noop);
    return c.json<StateResponse>(await buildState(colony, username));
  } catch (error) {
    console.error('state error', error);
    return fail(c, errorText(error), 500);
  }
});

// Lightweight summary for the in-feed splash screen.
api.get('/splash', async (c) => {
  try {
    const { colony } = await updateColony(() => noop);
    return c.json<SplashResponse>({
      type: 'splash',
      generation: colony.generation,
      day: dayOf(colony),
      population: colony.population,
      status: statusOf(colony),
    });
  } catch (error) {
    console.error('splash error', error);
    return fail(c, errorText(error), 500);
  }
});

// Choose (or change) your role.
api.post('/role', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return fail(c, 'Log in to join the colony.', 401);
    const body: { role?: unknown } = await c.req.json();
    if (!isRoleId(body.role)) return fail(c, 'Unknown role.');
    const role = getRole(body.role);

    const { colony } = await updateColony((col, now) => {
      addLog(
        col,
        now,
        `${role.emoji} u/${username} is now a ${role.name}.`,
        'info'
      );
      return { save: true, value: null };
    });
    const player = await getPlayer(username, colony.generation);
    player.role = role.id;
    await savePlayer(username, player);

    return c.json<ActionResponse>({
      type: 'action',
      ok: true,
      message: `You are now a ${role.name} ${role.emoji}`,
      state: await buildState(colony, username, player),
    });
  } catch (error) {
    console.error('role error', error);
    return fail(c, errorText(error), 500);
  }
});

// Work one shift for the colony.
api.post('/shift', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return fail(c, 'Log in to work for the colony.', 401);

    const body: {
      build?: { kind?: unknown; building?: unknown; tile?: unknown };
      score?: unknown;
    } = await c.req.json().catch(() => ({}));
    const score =
      typeof body.score === 'number' && Number.isFinite(body.score)
        ? Math.max(0, Math.min(1, body.score))
        : 0.5;
    let build: BuildOrder | null = null;
    if (body.build) {
      const { kind, building, tile } = body.build;
      if (kind === 'expand') build = { kind: 'expand' };
      else if (kind === 'wonder')
        build = {
          kind: 'wonder',
          tile: typeof tile === 'number' ? tile : null,
        };
      else if (typeof tile !== 'number') return fail(c, 'Invalid build order.');
      else if (kind === 'upgrade') build = { kind: 'upgrade', tile };
      else if (kind === 'build' && isBuildable(building))
        build = { kind: 'build', building, tile };
      else return fail(c, 'Invalid build order.');
    }

    const { colony: before } = await updateColony(() => noop);
    const player = await getPlayer(username, before.generation);
    const role = player.role;
    if (!role) return fail(c, 'Pick a role first.');

    const energy = staminaOf(player, Date.now());
    if (energy.stamina < 1) {
      const wait = (energy.nextAt ?? Date.now()) - Date.now();
      return c.json<ActionResponse>({
        type: 'action',
        ok: false,
        message: `You're out of stamina. +1 in ${Math.max(1, Math.ceil(wait / 60000))} min.`,
        state: await buildState(before, username, player),
      });
    }

    const { colony, value: result } = await updateColony<ShiftResult>(
      (col, now) => {
        if (col.collapsedAt !== null)
          return {
            save: false,
            value: { ok: false, message: 'The colony has collapsed.' },
          };
        const r = doShift(
          col,
          role,
          username,
          now,
          role === 'builder' ? build : null,
          score
        );
        return { save: r.ok, value: r };
      }
    );

    if (result.ok) {
      player.generation = colony.generation;
      player.shifts += 1;
      player.contribution += result.points;
      player.lastShiftAt = Date.now();
      player.stamina = energy.stamina - 1;
      player.staminaAt = energy.since;
      await Promise.all([
        savePlayer(username, player),
        addScore(username, colony.generation, result.points),
      ]);
      if (result.won) await awardVictory(colony);
    }

    return c.json<ActionResponse>({
      type: 'action',
      ok: result.ok,
      message: result.message,
      state: await buildState(colony, username, player),
    });
  } catch (error) {
    console.error('shift error', error);
    return fail(c, errorText(error), 500);
  }
});

// After a collapse, anyone can found a new colony.
api.post('/refound', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return fail(c, 'Log in to found a colony.', 401);

    const { colony, value: ok } = await updateColony((col, now) => {
      const won = col.wonderDoneAt !== null;
      if (col.collapsedAt === null && !won)
        return { save: false, value: false };
      const fresh = newColony(
        now,
        col.generation + 1,
        col.prestige + (won ? 1 : 0)
      );
      addLog(
        fresh,
        now,
        won
          ? `🚀 u/${username} led the champions to found a new colony — New Game+!`
          : `🚀 u/${username} led the survivors to found a new colony.`,
        'good'
      );
      Object.assign(col, fresh);
      return { save: true, value: true };
    });

    return c.json<ActionResponse>({
      type: 'action',
      ok,
      message: ok
        ? `Colony #${colony.generation} founded!`
        : 'The colony is still going — finish the Great Hive or keep it alive!',
      state: await buildState(colony, username),
    });
  } catch (error) {
    console.error('refound error', error);
    return fail(c, errorText(error), 500);
  }
});

// Vote yes/no on the current law proposal.
api.post('/vote', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return fail(c, 'Log in to vote.', 401);
    const body: { proposalId?: unknown; yes?: unknown } = await c.req.json();
    if (typeof body.proposalId !== 'number' || typeof body.yes !== 'boolean')
      return fail(c, 'Invalid vote.');
    const proposalId = body.proposalId;
    const yes = body.yes;

    const { colony: before } = await updateColony(() => noop);
    if (before.proposal?.id !== proposalId) {
      return c.json<ActionResponse>({
        type: 'action',
        ok: false,
        message: 'That vote has already closed.',
        state: await buildState(before, username),
      });
    }
    if (!(await claimVote(username, before.generation, proposalId, yes))) {
      return c.json<ActionResponse>({
        type: 'action',
        ok: false,
        message: 'You already voted on this proposal.',
        state: await buildState(before, username),
      });
    }

    const { colony, value: counted } = await updateColony((col) => {
      const ok = castVote(col, proposalId, yes);
      return { save: ok, value: ok };
    });
    if (!counted) await releaseVote(username, before.generation, proposalId);

    return c.json<ActionResponse>({
      type: 'action',
      ok: counted,
      message: counted
        ? `Vote counted: ${yes ? '👍 Yes' : '👎 No'}`
        : 'That vote has already closed.',
      state: await buildState(colony, username),
    });
  } catch (error) {
    console.error('vote error', error);
    return fail(c, errorText(error), 500);
  }
});
