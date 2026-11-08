// Shared game definitions for Hive Colony (used by client and server).

export const TICK_MS = 10 * 60 * 1000; // the world advances every 10 minutes
export const TICKS_PER_DAY = 144;
export const MAX_STAMINA = 5; // shifts a player can do in a row
export const STAMINA_REGEN_MS = 4 * 60 * 1000; // one stamina point refills every 4 minutes
export const FOOD_PER_COLONIST = 0.5; // eaten per tick
export const MAINTENANCE_EVERY = 36; // ticks (6 hours)
export const MAINTENANCE_PER_LEVEL = 2; // materials
export const VOTE_TICKS = 36; // each proposal is open for 6 hours
export const MAX_LEVEL = 3;

// ---------- map & buildings ----------

export const START_GRID = 8;
export const MAX_GRID = 12;
export const EXPAND_FILL = 0.7; // share of tiles that must be built before expanding
/** Materials to grow the island from the given size (+2 per side). */
export const EXPAND_COST: Record<number, number> = { 8: 400, 10: 900 };

/** Centre-ish tile for a square grid (where the Hive Core starts). */
export const coreTileFor = (n: number): number => (n / 2 - 1) * n + (n / 2 - 1);

// ---------- the Great Hive (wonder) ----------

export const WONDER_STAGES = 5;
export const WONDER_STAGE_COSTS: readonly number[] = [200, 300, 450, 650, 900];
export const WONDER_REQ = { population: 30, research: 300 };
export const PRESTIGE_BONUS = 0.1; // +10% production per Great Hive completed
export const MAX_PRESTIGE_BONUS = 5;

export type BuildingId =
  'core' | 'shelter' | 'farm' | 'mine' | 'solar' | 'lab' | 'wonder';

export type BuildingDef = {
  id: BuildingId;
  name: string;
  emoji: string;
  cost: number; // materials
  housing: number; // per level
  blurb: string;
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  core: {
    id: 'core',
    name: 'Hive Core',
    emoji: '🐝',
    cost: 0,
    housing: 5,
    blurb: 'The heart of the colony. Houses 5.',
  },
  shelter: {
    id: 'shelter',
    name: 'Shelter',
    emoji: '🏠',
    cost: 20,
    housing: 5,
    blurb: 'Houses 5 colonists per level.',
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    emoji: '🌱',
    cost: 30,
    housing: 0,
    blurb: '+3 food per tick per level.',
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    emoji: '🪨',
    cost: 25,
    housing: 0,
    blurb: '+1 material per tick per level.',
  },
  solar: {
    id: 'solar',
    name: 'Solar Array',
    emoji: '☀️',
    cost: 25,
    housing: 0,
    blurb: '+3 energy per tick per level.',
  },
  lab: {
    id: 'lab',
    name: 'Lab',
    emoji: '🧪',
    cost: 40,
    housing: 0,
    blurb: '+1 research every 2 ticks per level.',
  },
  wonder: {
    id: 'wonder',
    name: 'Great Hive',
    emoji: '🏛️',
    cost: 200,
    housing: 10,
    blurb: "The colony's wonder. Finish all 5 stages to win.",
  },
};

/** Buildings that never decay, need no upkeep and can't be upgraded normally. */
export const isSpecial = (b: BuildingId): boolean =>
  b === 'core' || b === 'wonder';

export const BUILDABLE: readonly BuildingId[] = [
  'shelter',
  'farm',
  'mine',
  'solar',
  'lab',
];

export const isBuildable = (value: unknown): value is BuildingId =>
  BUILDABLE.some((b) => b === value);

export type Tile = {
  b: BuildingId;
  by: string;
  at: number;
  lvl: number;
} | null;

/** Materials needed to raise a building from `lvl` to `lvl + 1`. */
export const upgradeCost = (b: BuildingId, lvl: number): number =>
  BUILDINGS[b].cost * (lvl + 1);

export const canUpgrade = (t: Tile): boolean =>
  Boolean(t && !isSpecial(t.b) && t.lvl < MAX_LEVEL);

// ---------- laws ----------

export type LawId =
  'rationing' | 'overtime' | 'festivals' | 'science' | 'austerity';

export type LawDef = {
  id: LawId;
  name: string;
  emoji: string;
  effect: string;
};

export const LAWS: readonly LawDef[] = [
  {
    id: 'rationing',
    name: 'Food Rationing',
    emoji: '🍞',
    effect: 'Colonists eat 40% less food, but morale drops 1 per hour.',
  },
  {
    id: 'overtime',
    name: 'Mandatory Overtime',
    emoji: '⏰',
    effect: 'All work shifts produce 30% more, but morale drops 2 per hour.',
  },
  {
    id: 'festivals',
    name: 'Weekly Festivals',
    emoji: '🎉',
    effect: 'Morale rises 3 per hour, but colonists eat 20% more food.',
  },
  {
    id: 'science',
    name: 'Science First',
    emoji: '🧪',
    effect: 'Labs produce double research, but farms produce 20% less.',
  },
  {
    id: 'austerity',
    name: 'Austerity',
    emoji: '🧱',
    effect: 'Building maintenance costs half, but morale drops 1 per hour.',
  },
];

export const getLaw = (id: LawId): LawDef =>
  LAWS.find((l) => l.id === id) ?? LAWS[0]!;

export const hasLaw = (c: Colony, id: LawId): boolean => c.laws.includes(id);

export type Proposal = {
  id: number;
  law: LawId;
  enact: boolean; // true = pass the law, false = repeal it
  endsAtTick: number;
  yes: number;
  no: number;
};

// ---------- roles ----------

export type RoleId = 'farmer' | 'miner' | 'builder' | 'scientist' | 'explorer';

export type Role = {
  id: RoleId;
  name: string;
  emoji: string;
  blurb: string;
};

export const ROLES: readonly Role[] = [
  {
    id: 'farmer',
    name: 'Farmer',
    emoji: '🌾',
    blurb: 'Grows food to feed the colony.',
  },
  {
    id: 'miner',
    name: 'Miner',
    emoji: '⛏️',
    blurb: 'Digs up materials. Uses a little energy.',
  },
  {
    id: 'builder',
    name: 'Builder',
    emoji: '🏗️',
    blurb: 'Places and upgrades buildings on the colony map, or repairs them.',
  },
  {
    id: 'scientist',
    name: 'Scientist',
    emoji: '🔬',
    blurb: 'Generates energy and research that boosts all work.',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    emoji: '🧭',
    blurb: 'Scouts the wilds. Finds random loot — or new colonists.',
  },
];

export const isRoleId = (value: unknown): value is RoleId =>
  ROLES.some((r) => r.id === value);

export const getRole = (id: RoleId): Role =>
  ROLES.find((r) => r.id === id) ?? ROLES[0]!;

// ---------- state ----------

export type LogKind = 'good' | 'bad' | 'info' | 'event';

export type LogEntry = {
  at: number;
  text: string;
  kind: LogKind;
};

export type Colony = {
  generation: number;
  foundedAt: number;
  ticks: number;
  lastTickAt: number;
  food: number;
  materials: number;
  energy: number;
  research: number;
  population: number;
  morale: number;
  gridSize: number;
  tiles: Tile[];
  wonderDoneAt: number | null;
  prestige: number; // Great Hives completed by previous colonies here
  laws: LawId[];
  proposal: Proposal | null;
  proposalSeq: number;
  collapsedAt: number | null;
  log: LogEntry[];
};

export type Player = {
  role: RoleId | null;
  generation: number;
  shifts: number;
  contribution: number;
  lastShiftAt: number;
  stamina: number; // stored stamina at `staminaAt`
  staminaAt: number; // when regeneration was last counted from
};

/** Current stamina and when the next point arrives. */
export const staminaOf = (
  p: Player,
  now: number
): { stamina: number; since: number; nextAt: number | null } => {
  if (p.stamina >= MAX_STAMINA)
    return { stamina: MAX_STAMINA, since: now, nextAt: null };
  const gained = Math.max(
    0,
    Math.floor((now - p.staminaAt) / STAMINA_REGEN_MS)
  );
  const stamina = Math.min(MAX_STAMINA, p.stamina + gained);
  if (stamina >= MAX_STAMINA) return { stamina, since: now, nextAt: null };
  const since = p.staminaAt + gained * STAMINA_REGEN_MS;
  return { stamina, since, nextAt: since + STAMINA_REGEN_MS };
};

/** What players tap in each role's shift mini-game. */
export const MINIGAME_TARGET: Record<RoleId, string> = {
  farmer: '🌾',
  miner: '💎',
  builder: '🧱',
  scientist: '⚡',
  explorer: '🗝️',
};

export type ColonyStatus =
  | 'victorious'
  | 'thriving'
  | 'stable'
  | 'struggling'
  | 'starving'
  | 'collapsed';

// ---------- derived values ----------

/** Sum of levels of a building type. */
export const levelsOf = (c: Colony, b: BuildingId): number =>
  c.tiles.reduce((n, t) => (t?.b === b ? n + t.lvl : n), 0);

/** Sum of levels of all regular (non-special) buildings. */
export const totalLevels = (c: Colony): number =>
  c.tiles.reduce((n, t) => (t && !isSpecial(t.b) ? n + t.lvl : n), 0);

export const buildingCount = (c: Colony): number =>
  c.tiles.reduce((n, t) => (t && !isSpecial(t.b) ? n + 1 : n), 0);

/** Tiles with anything on them (including core and wonder). */
export const usedTiles = (c: Colony): number =>
  c.tiles.reduce((n, t) => (t ? n + 1 : n), 0);

export const fillOf = (c: Colony): number => usedTiles(c) / c.tiles.length;

export type ExpandCheck =
  | { ok: true; cost: number; next: number }
  | { ok: false; reason: string; cost: number | null };

export const expandCheck = (c: Colony): ExpandCheck => {
  const cost = EXPAND_COST[c.gridSize];
  if (c.gridSize >= MAX_GRID || cost === undefined)
    return {
      ok: false,
      reason: 'The island is as big as it gets.',
      cost: null,
    };
  if (fillOf(c) < EXPAND_FILL) {
    return {
      ok: false,
      reason: `Fill ${Math.round(EXPAND_FILL * 100)}% of the island first (now ${Math.round(fillOf(c) * 100)}%).`,
      cost,
    };
  }
  if (c.materials < cost)
    return {
      ok: false,
      reason: `Needs ${cost} materials (have ${c.materials}).`,
      cost,
    };
  return { ok: true, cost, next: c.gridSize + 2 };
};

export const wonderTile = (c: Colony): number =>
  c.tiles.findIndex((t) => t?.b === 'wonder');

export const wonderStage = (c: Colony): number => {
  const t = c.tiles[wonderTile(c)];
  return t ? t.lvl : 0;
};

export type WonderCheck =
  | { ok: true; cost: number; stage: number }
  | { ok: false; reason: string; cost: number | null };

/** Can the next Great Hive stage (1..5) be built right now? */
export const wonderCheck = (c: Colony): WonderCheck => {
  if (c.wonderDoneAt !== null)
    return { ok: false, reason: 'The Great Hive is complete!', cost: null };
  const stage = wonderStage(c) + 1;
  const cost = WONDER_STAGE_COSTS[stage - 1] ?? 0;
  if (
    c.population < WONDER_REQ.population ||
    c.research < WONDER_REQ.research
  ) {
    return {
      ok: false,
      reason: `Unlocks at ${WONDER_REQ.population} colonists and ${WONDER_REQ.research} research.`,
      cost,
    };
  }
  if (c.materials < cost)
    return {
      ok: false,
      reason: `Needs ${cost} materials (have ${c.materials}).`,
      cost,
    };
  return { ok: true, cost, stage };
};

export const capacityOf = (c: Colony): number =>
  c.tiles.reduce((n, t) => n + (t ? BUILDINGS[t.b].housing * t.lvl : 0), 0);

export const energyUpkeepOf = (c: Colony): number =>
  1 + Math.floor(totalLevels(c) / 3);

export const maintenanceOf = (c: Colony): number => {
  const base = totalLevels(c) * MAINTENANCE_PER_LEVEL;
  return hasLaw(c, 'austerity') ? Math.ceil(base / 2) : base;
};

export const foodEatenPerTick = (c: Colony): number => {
  let mult = 1;
  if (hasLaw(c, 'rationing')) mult *= 0.6;
  if (hasLaw(c, 'festivals')) mult *= 1.2;
  return Math.ceil(c.population * FOOD_PER_COLONIST * mult);
};

/** Morale change applied once per hour by active laws. */
export const lawMoralePerHour = (c: Colony): number =>
  (hasLaw(c, 'rationing') ? -1 : 0) +
  (hasLaw(c, 'overtime') ? -2 : 0) +
  (hasLaw(c, 'festivals') ? 3 : 0) +
  (hasLaw(c, 'austerity') ? -1 : 0);

export type Passive = {
  food: number;
  materials: number;
  energy: number;
  research: number;
};

/** What buildings produce per tick (research is averaged). */
export const passiveOf = (c: Colony): Passive => ({
  food: Math.floor(levelsOf(c, 'farm') * 3 * (hasLaw(c, 'science') ? 0.8 : 1)),
  materials: levelsOf(c, 'mine'),
  energy: levelsOf(c, 'solar') * 3,
  research: levelsOf(c, 'lab') * 0.5 * (hasLaw(c, 'science') ? 2 : 1),
});

const neighbours = (i: number, n: number): number[] => {
  const r = Math.floor(i / n);
  const col = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (col > 0) out.push(i - 1);
  if (col < n - 1) out.push(i + 1);
  return out;
};

export const isTileIndex = (c: Colony, i: number): boolean =>
  Number.isInteger(i) && i >= 0 && i < c.tiles.length;

/** A tile can be built on if it's empty and touches an existing building. */
export const canPlaceAt = (c: Colony, i: number): boolean =>
  isTileIndex(c, i) &&
  !c.tiles[i] &&
  neighbours(i, c.gridSize).some((n) => Boolean(c.tiles[n]));

export const statusOf = (c: Colony): ColonyStatus => {
  if (c.collapsedAt !== null) return 'collapsed';
  if (c.wonderDoneAt !== null) return 'victorious';
  if (c.food === 0) return 'starving';
  if (c.morale < 40 || c.energy === 0 || c.food < c.population * 9)
    return 'struggling';
  if (c.morale >= 75 && c.food >= c.population * 20) return 'thriving';
  return 'stable';
};

/** Research, conditions and laws scale every work shift. */
export const productionMultiplier = (c: Colony): number => {
  const researchBoost = 1 + Math.min(c.research, 600) / 600; // up to 2x
  const energyFactor = c.energy > 0 ? 1 : 0.5;
  const moraleFactor = c.morale >= 40 ? 1 : 0.75;
  const lawFactor = hasLaw(c, 'overtime') ? 1.3 : 1;
  const prestigeFactor =
    1 + PRESTIGE_BONUS * Math.min(c.prestige, MAX_PRESTIGE_BONUS);
  return (
    researchBoost * energyFactor * moraleFactor * lawFactor * prestigeFactor
  );
};

export const dayOf = (c: Colony): number =>
  Math.floor(c.ticks / TICKS_PER_DAY) + 1;
