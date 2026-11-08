// Pure simulation logic. No Devvit imports here so it can be tested in plain Node.
import {
  BUILDINGS,
  START_GRID,
  coreTileFor,
  expandCheck,
  isSpecial,
  wonderCheck,
  wonderTile,
  LAWS,
  MAINTENANCE_EVERY,
  MAX_STAMINA,
  TICK_MS,
  TICKS_PER_DAY,
  VOTE_TICKS,
  WONDER_STAGES,
  canPlaceAt,
  canUpgrade,
  capacityOf,
  energyUpkeepOf,
  foodEatenPerTick,
  getLaw,
  isTileIndex,
  lawMoralePerHour,
  levelsOf,
  maintenanceOf,
  passiveOf,
  productionMultiplier,
  upgradeCost,
} from '../../shared/game';
import type {
  BuildingId,
  Colony,
  LogKind,
  Player,
  Proposal,
  RoleId,
  Tile,
} from '../../shared/game';

type Rng = () => number;

const MAX_LOG = 30;
const MAX_CATCHUP_TICKS = TICKS_PER_DAY * 3; // never simulate more than 3 days at once
const EVENT_CHANCE = 1 / 36; // about 4 events per day
const FIRST_EVENT_TICK = 12; // give a new colony 2 hours of peace

const startingTiles = (now: number, n = START_GRID): Tile[] => {
  const tiles: Tile[] = Array.from({ length: n * n }, () => null);
  const core = coreTileFor(n);
  tiles[core] = { b: 'core', by: 'founders', at: now, lvl: 1 };
  tiles[core + 1] = { b: 'shelter', by: 'founders', at: now, lvl: 1 };
  tiles[core + n] = { b: 'shelter', by: 'founders', at: now, lvl: 1 };
  return tiles;
};

/** Grow the island by one ring of land on every side, keeping buildings in place. */
export const expandIsland = (c: Colony): void => {
  const old = c.gridSize;
  const n = old + 2;
  const tiles: Tile[] = Array.from({ length: n * n }, () => null);
  c.tiles.forEach((t, i) => {
    const r = Math.floor(i / old);
    const col = i % old;
    tiles[(r + 1) * n + (col + 1)] = t;
  });
  c.tiles = tiles;
  c.gridSize = n;
};

const makeProposal = (c: Colony): Proposal => {
  const law = LAWS[c.proposalSeq % LAWS.length]!.id;
  c.proposalSeq += 1;
  return {
    id: c.proposalSeq,
    law,
    enact: !c.laws.includes(law),
    endsAtTick: c.ticks + VOTE_TICKS,
    yes: 0,
    no: 0,
  };
};

export const newColony = (
  now: number,
  generation: number,
  prestige = 0
): Colony => {
  const c: Colony = {
    generation,
    foundedAt: now,
    ticks: 0,
    lastTickAt: now,
    food: 500,
    materials: 80 + prestige * 100,
    energy: 80,
    research: 0,
    population: 10,
    morale: 70,
    gridSize: START_GRID,
    tiles: startingTiles(now),
    wonderDoneAt: null,
    prestige,
    laws: [],
    proposal: null,
    proposalSeq: 0,
    collapsedAt: null,
    log: [
      {
        at: now,
        text:
          prestige > 0
            ? `🐝 Colony #${generation} has landed — veterans of ${prestige} Great Hive${prestige === 1 ? '' : 's'}, working ${Math.round(Math.min(prestige, 5) * 10)}% faster.`
            : `🐝 Colony #${generation} has landed. 10 colonists step out into the unknown.`,
        kind: 'info',
      },
    ],
  };
  c.proposal = makeProposal(c);
  return c;
};

/** Upgrade colonies saved by older versions of the game. */
export const migrateColony = (
  c: Colony & { shelters?: number },
  now: number
): Colony => {
  // Phase 1 → 2: shelters counter became map tiles.
  if (typeof c.gridSize !== 'number') c.gridSize = START_GRID;
  if (!Array.isArray(c.tiles) || c.tiles.length !== c.gridSize * c.gridSize) {
    c.gridSize = START_GRID;
    const oldShelters = typeof c.shelters === 'number' ? c.shelters : 3;
    c.tiles = startingTiles(now);
    for (let extra = oldShelters - 3; extra > 0; extra--) {
      const free = c.tiles.findIndex((_, i) => canPlaceAt(c, i));
      if (free < 0) break;
      c.tiles[free] = { b: 'shelter', by: 'founders', at: now, lvl: 1 };
    }
  }
  delete c.shelters;
  // Phase 2 → 3: tiles gained levels; colony gained laws.
  c.tiles = c.tiles.map((t) =>
    t ? { ...t, lvl: typeof t.lvl === 'number' ? t.lvl : 1 } : null
  );
  if (!Array.isArray(c.laws)) c.laws = [];
  if (c.wonderDoneAt === undefined) c.wonderDoneAt = null;
  if (typeof c.prestige !== 'number') c.prestige = 0;
  if (typeof c.proposalSeq !== 'number') c.proposalSeq = 0;
  if (!c.proposal && c.collapsedAt === null) c.proposal = makeProposal(c);
  return c;
};

export const newPlayer = (generation: number): Player => ({
  role: null,
  generation,
  shifts: 0,
  contribution: 0,
  lastShiftAt: 0,
  stamina: MAX_STAMINA,
  staminaAt: 0,
});

export const addLog = (
  c: Colony,
  at: number,
  text: string,
  kind: LogKind
): void => {
  c.log.unshift({ at, text, kind });
  if (c.log.length > MAX_LOG) c.log.length = MAX_LOG;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const randInt = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

/** Lower a building's level by one (destroying it at level 1). Returns a description. */
const damageTile = (c: Colony, i: number): string => {
  const t = c.tiles[i];
  if (!t) return '';
  const name = BUILDINGS[t.b].name;
  if (t.lvl > 1) {
    t.lvl -= 1;
    return `a ${name} was damaged (now Lv${t.lvl})`;
  }
  c.tiles[i] = null;
  return `a ${name} was destroyed`;
};

/** Remove the most recently built (non-core) building. */
const crumbleNewest = (c: Colony): BuildingId | null => {
  let idx = -1;
  let newest = -Infinity;
  c.tiles.forEach((t, i) => {
    if (t && !isSpecial(t.b) && t.at >= newest) {
      newest = t.at;
      idx = i;
    }
  });
  const tile = c.tiles[idx];
  if (!tile) return null;
  damageTile(c, idx);
  return tile.b;
};

// ---------- random events ----------

type ColonyEvent = (c: Colony, at: number, rng: Rng) => void;

const EVENTS: readonly ColonyEvent[] = [
  // Storm
  (c, at, rng) => {
    const built = c.tiles
      .map((t, i) => (t && !isSpecial(t.b) ? i : -1))
      .filter((i) => i >= 0);
    if (built.length === 0) {
      addLog(
        c,
        at,
        '⛈️ A storm swept over the empty plains. No damage.',
        'event'
      );
      return;
    }
    const target = built[Math.floor(rng() * built.length)] ?? built[0]!;
    addLog(
      c,
      at,
      `⛈️ A violent storm hit — ${damageTile(c, target)}!`,
      'event'
    );
    c.morale -= 3;
  },
  // Meteor shower
  (c, at, rng) => {
    const gain = randInt(rng, 30, 70);
    c.materials += gain;
    addLog(
      c,
      at,
      `☄️ A meteor shower! Colonists collected ${gain} materials from the craters.`,
      'event'
    );
  },
  // Sickness
  (c, at) => {
    if (levelsOf(c, 'lab') >= 2) {
      addLog(
        c,
        at,
        '🤒 A fever spread — but the labs found a cure in time!',
        'event'
      );
      return;
    }
    const lost = Math.max(1, Math.ceil(c.population * 0.08));
    c.population = Math.max(0, c.population - lost);
    c.morale -= 5;
    addLog(
      c,
      at,
      `🤒 A fever swept the colony. ${lost} colonist${lost === 1 ? '' : 's'} didn't make it. (2+ lab levels would have helped.)`,
      'event'
    );
  },
  // Traders
  (c, at) => {
    if (c.materials >= 60) {
      c.materials -= 30;
      c.food += 70;
      addLog(
        c,
        at,
        '🧳 Wandering traders swapped 70 food for 30 materials.',
        'event'
      );
    } else {
      c.morale += 2;
      addLog(
        c,
        at,
        '🧳 Traders passed through, sharing stories around the fire. +2 morale.',
        'event'
      );
    }
  },
  // Bumper harvest
  (c, at) => {
    const bonus = Math.max(20, levelsOf(c, 'farm') * 15);
    c.food += bonus;
    addLog(
      c,
      at,
      `🌈 Perfect weather — a bumper harvest brought in ${bonus} extra food!`,
      'event'
    );
  },
  // Refugees
  (c, at, rng) => {
    const room = capacityOf(c) - c.population;
    const arriving = randInt(rng, 2, 4);
    if (room > 0) {
      const n = Math.min(room, arriving);
      c.population += n;
      addLog(
        c,
        at,
        `👥 ${n} refugees arrived and were welcomed into the hive!`,
        'event'
      );
    } else {
      c.morale -= 4;
      addLog(
        c,
        at,
        `👥 ${arriving} refugees arrived, but there was no room. They were turned away. -4 morale.`,
        'event'
      );
    }
  },
  // Solar flare
  (c, at) => {
    const lost = Math.floor(c.energy * 0.3);
    c.energy -= lost;
    addLog(
      c,
      at,
      `🔥 A solar flare fried the grid — ${lost} energy lost.`,
      'event'
    );
  },
];

// ---------- voting ----------

const resolveProposal = (c: Colony, at: number): void => {
  const p = c.proposal;
  if (!p || c.ticks < p.endsAtTick) return;
  const law = getLaw(p.law);
  const passed = p.yes > p.no;
  const action = p.enact ? 'enact' : 'repeal';
  if (passed) {
    c.laws = p.enact
      ? [...c.laws.filter((l) => l !== law.id), law.id]
      : c.laws.filter((l) => l !== law.id);
    addLog(
      c,
      at,
      `🗳️ The hive voted ${p.yes}–${p.no} to ${action} ${law.emoji} ${law.name}.`,
      'good'
    );
  } else {
    addLog(
      c,
      at,
      `🗳️ The proposal to ${action} ${law.emoji} ${law.name} failed (${p.yes}–${p.no}).`,
      'info'
    );
  }
  c.proposal = makeProposal(c);
};

export const castVote = (
  c: Colony,
  proposalId: number,
  yes: boolean
): boolean => {
  const p = c.proposal;
  if (!p || p.id !== proposalId || c.ticks >= p.endsAtTick) return false;
  if (yes) p.yes += 1;
  else p.no += 1;
  return true;
};

// ---------- the tick ----------

/** One 10-minute step of the world. Mutates the colony. */
export const tickOnce = (
  c: Colony,
  at: number,
  rng: Rng = Math.random
): void => {
  c.ticks += 1;

  // 1. Buildings produce.
  const p = passiveOf(c);
  c.food += p.food;
  c.materials += p.materials;
  c.energy += p.energy;
  if (c.ticks % 2 === 0) c.research += p.research * 2;

  // 2. Colonists eat.
  const eat = foodEatenPerTick(c);
  if (c.food >= eat) {
    c.food -= eat;
  } else {
    c.food = 0;
    c.morale -= 1;
    if (c.ticks % 6 === 0) {
      const lost = Math.max(1, Math.ceil(c.population * 0.05));
      c.population = Math.max(0, c.population - lost);
      c.morale -= 4;
      addLog(
        c,
        at,
        `💀 Starvation! ${lost} colonist${lost === 1 ? '' : 's'} left the colony.`,
        'bad'
      );
    }
  }

  // 3. Buildings consume energy.
  const upkeep = energyUpkeepOf(c);
  if (c.energy >= upkeep) {
    c.energy -= upkeep;
  } else {
    if (c.energy > 0)
      addLog(c, at, '🔌 The power grid went dark. All work is slowed.', 'bad');
    c.energy = 0;
    c.morale -= 2;
  }

  // 4. Morale: crowding, recovery, laws.
  const capacity = capacityOf(c);
  const crowded = c.population > capacity;
  if (crowded) c.morale -= 3;
  if (!crowded && c.food > 0 && c.energy > 0 && c.morale < 60) c.morale += 1;
  if (c.ticks % 6 === 0) c.morale += lawMoralePerHour(c);

  // 5. Maintenance every 6 hours, or the newest building crumbles.
  if (c.ticks % MAINTENANCE_EVERY === 0) {
    const cost = maintenanceOf(c);
    if (c.materials >= cost) {
      c.materials -= cost;
    } else {
      c.materials = 0;
      const lost = crumbleNewest(c);
      if (lost)
        addLog(
          c,
          at,
          `🏚️ A ${BUILDINGS[lost].name} crumbled — not enough materials for repairs.`,
          'bad'
        );
    }
  }

  // 6. Random event.
  if (c.ticks >= FIRST_EVENT_TICK && rng() < EVENT_CHANCE) {
    const event = EVENTS[Math.floor(rng() * EVENTS.length)];
    event?.(c, at, rng);
  }

  // 7. Growth every hour for a well-fed, happy colony.
  if (
    c.ticks % 6 === 0 &&
    c.population > 0 &&
    c.population < capacityOf(c) &&
    c.food >= c.population * 10 &&
    c.morale >= 60
  ) {
    c.population += 1;
    addLog(c, at, '👶 The colony grew! A new colonist joined.', 'good');
  }

  // 8. Close the vote if its time is up.
  resolveProposal(c, at);

  c.morale = clamp(c.morale, 0, 100);

  if (c.population <= 0) {
    c.population = 0;
    c.collapsedAt = at;
    addLog(
      c,
      at,
      '☠️ The last colonist is gone. The colony has collapsed.',
      'bad'
    );
  }
};

/** Run every tick that should have happened by `now`. Returns true if anything changed. */
export const advance = (
  c: Colony,
  now: number,
  rng: Rng = Math.random
): boolean => {
  if (c.collapsedAt !== null) return false;
  let pending = Math.floor((now - c.lastTickAt) / TICK_MS);
  if (pending <= 0) return false;
  if (pending > MAX_CATCHUP_TICKS) {
    c.lastTickAt += (pending - MAX_CATCHUP_TICKS) * TICK_MS;
    pending = MAX_CATCHUP_TICKS;
  }
  for (let i = 0; i < pending && c.collapsedAt === null; i++) {
    c.lastTickAt += TICK_MS;
    tickOnce(c, c.lastTickAt, rng);
  }
  if (c.collapsedAt !== null) c.lastTickAt = now;
  return true;
};

// ---------- work shifts ----------

export type BuildOrder =
  | { kind: 'build'; building: BuildingId; tile: number }
  | { kind: 'upgrade'; tile: number }
  | { kind: 'expand' }
  | { kind: 'wonder'; tile: number | null };

export type ShiftResult =
  | { ok: true; message: string; points: number; won?: boolean }
  | { ok: false; message: string };

/** Perform one work shift. Mutates the colony on success. */
export const doShift = (
  c: Colony,
  role: RoleId,
  username: string,
  now: number,
  build: BuildOrder | null = null,
  score = 0.5,
  rng: Rng = Math.random
): ShiftResult => {
  // Mini-game performance: score 0..1 → 0.5x..1.5x output.
  const perf = 0.5 + clamp(Number.isFinite(score) ? score : 0.5, 0, 1);
  const mult = productionMultiplier(c) * perf;
  const who = `u/${username}`;
  let message: string;
  let logText: string;
  let points: number;
  let kind: LogKind = 'info';

  switch (role) {
    case 'farmer': {
      const gain = Math.round(15 * mult);
      c.food += gain;
      message = `You harvested ${gain} food.`;
      logText = `🌾 ${who} harvested ${gain} food.`;
      points = gain;
      break;
    }
    case 'miner': {
      const gain = Math.round(10 * mult);
      c.materials += gain;
      c.energy = Math.max(0, c.energy - 2);
      message = `You mined ${gain} materials (-2 energy).`;
      logText = `⛏️ ${who} mined ${gain} materials.`;
      points = gain + 4;
      break;
    }
    case 'builder': {
      if (!build) {
        c.morale = clamp(c.morale + 3, 0, 100);
        message = 'You repaired and tidied the buildings: +3 morale.';
        logText = `🛠️ ${who} fixed up the colony.`;
        points = 8;
        break;
      }
      if (build.kind === 'expand') {
        const check = expandCheck(c);
        if (!check.ok) return { ok: false, message: check.reason };
        c.materials -= check.cost;
        expandIsland(c);
        message = `You led the expedition — the island grew to ${c.gridSize}×${c.gridSize}!`;
        logText = `🏝️ ${who} expanded the island to ${c.gridSize}×${c.gridSize}! New land to build on.`;
        points = check.cost;
        kind = 'good';
        break;
      }
      if (build.kind === 'wonder') {
        const check = wonderCheck(c);
        if (!check.ok) return { ok: false, message: check.reason };
        let at = wonderTile(c);
        if (at < 0) {
          if (build.tile === null || !canPlaceAt(c, build.tile)) {
            return {
              ok: false,
              message:
                'Pick an empty tile next to a building for the Great Hive foundation.',
            };
          }
          at = build.tile;
          c.tiles[at] = { b: 'wonder', by: username, at: now, lvl: 1 };
        } else {
          const t = c.tiles[at];
          if (t) {
            t.lvl = check.stage;
            t.at = now;
          }
        }
        c.materials -= check.cost;
        points = check.cost;
        kind = 'good';
        if (check.stage >= WONDER_STAGES) {
          c.wonderDoneAt = now;
          c.morale = 100;
          message =
            '🏆 You placed the final stone. THE GREAT HIVE IS COMPLETE!';
          logText = `🏆 ${who} completed the GREAT HIVE! The colony has won!`;
          addLog(c, now, logText, 'good');
          return { ok: true, message, points, won: true };
        }
        message = `You built Great Hive stage ${check.stage}/${WONDER_STAGES}!`;
        logText =
          check.stage === 1
            ? `🏛️ ${who} laid the foundation of the Great Hive!`
            : `🏛️ ${who} raised the Great Hive to stage ${check.stage}/${WONDER_STAGES}.`;
        break;
      }
      if (build.kind === 'upgrade') {
        const t = isTileIndex(c, build.tile) ? c.tiles[build.tile] : null;
        if (!t || !canUpgrade(t))
          return { ok: false, message: "That building can't be upgraded." };
        const cost = upgradeCost(t.b, t.lvl);
        const def = BUILDINGS[t.b];
        if (c.materials < cost) {
          return {
            ok: false,
            message: `Upgrading needs ${cost} materials — the colony has ${c.materials}.`,
          };
        }
        c.materials -= cost;
        t.lvl += 1;
        message = `You upgraded a ${def.name} to Lv${t.lvl}!`;
        logText = `⬆️ ${who} upgraded a ${def.name} ${def.emoji} to Lv${t.lvl}.`;
        points = cost;
        kind = 'good';
        break;
      }
      const def = BUILDINGS[build.building];
      if (!canPlaceAt(c, build.tile)) {
        return {
          ok: false,
          message:
            'You can only build on an empty tile next to another building.',
        };
      }
      if (c.materials < def.cost) {
        return {
          ok: false,
          message: `A ${def.name} needs ${def.cost} materials — the colony has ${c.materials}. Ask the miners!`,
        };
      }
      c.materials -= def.cost;
      c.tiles[build.tile] = { b: def.id, by: username, at: now, lvl: 1 };
      message = `You built a ${def.name} ${def.emoji}!`;
      logText = `🏗️ ${who} built a ${def.name} ${def.emoji}.`;
      points = def.cost;
      kind = 'good';
      break;
    }
    case 'scientist': {
      const gain = Math.round(12 * mult);
      c.energy += gain;
      c.research += 2;
      message = `You generated ${gain} energy and +2 research.`;
      logText = `🔬 ${who} produced ${gain} energy.`;
      points = gain + 4;
      break;
    }
    case 'explorer': {
      const roll = rng();
      if (roll < 0.35) {
        const gain = randInt(rng, 8, 25);
        c.food += gain;
        message = `You found wild berries: +${gain} food.`;
        logText = `🧭 ${who} found ${gain} food in the wilds.`;
        points = gain;
      } else if (roll < 0.65) {
        const gain = randInt(rng, 5, 18);
        c.materials += gain;
        message = `You salvaged a wreck: +${gain} materials.`;
        logText = `🧭 ${who} salvaged ${gain} materials.`;
        points = gain + 4;
      } else if (roll < 0.85) {
        const gain = randInt(rng, 5, 15);
        c.energy += gain;
        message = `You found a power cell: +${gain} energy.`;
        logText = `🧭 ${who} found a ${gain}-energy power cell.`;
        points = gain + 4;
      } else if (roll < 0.95) {
        if (c.population < capacityOf(c)) {
          c.population += 1;
          message =
            'You found a lost survivor and brought them home! +1 colonist.';
          logText = `🧭 ${who} rescued a lost survivor!`;
          points = 30;
          kind = 'good';
        } else {
          c.morale = clamp(c.morale + 3, 0, 100);
          message =
            'You found a survivor, but there was no shelter for them. Build more! +3 morale.';
          logText = `🧭 ${who} met a survivor — but the colony had no room.`;
          points = 10;
        }
      } else {
        message = 'You came back empty-handed. The wilds are cruel.';
        logText = `🧭 ${who} returned empty-handed.`;
        points = 2;
      }
      break;
    }
  }

  c.morale = clamp(c.morale + 1, 0, 100); // working together lifts spirits
  addLog(c, now, logText, kind);
  if (role !== 'builder' && perf >= 1.3)
    message += ` Great shift! ×${perf.toFixed(1)}`;
  else if (role !== 'builder' && perf <= 0.7)
    message += ` Sloppy shift… ×${perf.toFixed(1)}`;
  return {
    ok: true,
    message,
    points: Math.round(points * (role === 'builder' ? 1 : perf)),
  };
};
