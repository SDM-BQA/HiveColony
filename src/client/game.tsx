import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { useColony } from './useColony';
import { MiniGame } from './MiniGame';
import { IsoMap } from './map/IsoMap';
import { isMuted, onMuteChange, setMuted, sfx } from './sound';
import {
  initMusic,
  isMusicOn,
  onMusicChange,
  setMood,
  setMusicOn,
} from './music';
import {
  BUILDABLE,
  EXPAND_FILL,
  MAX_GRID,
  MAX_LEVEL,
  MAX_PRESTIGE_BONUS,
  WONDER_REQ,
  WONDER_STAGES,
  WONDER_STAGE_COSTS,
  expandCheck,
  fillOf,
  wonderCheck,
  wonderStage,
  BUILDINGS,
  ROLES,
  MAX_STAMINA,
  MINIGAME_TARGET,
  TICK_MS,
  buildingCount,
  canPlaceAt,
  canUpgrade,
  foodEatenPerTick,
  getLaw,
  upgradeCost,
  dayOf,
  energyUpkeepOf,
  getRole,
  passiveOf,
  staminaOf,
} from '../shared/game';
import type {
  BuildingId,
  Colony,
  ColonyStatus,
  LogEntry,
  RoleId,
} from '../shared/game';
import type { LeaderEntry, StateResponse } from '../shared/api';

// ---------- helpers ----------

const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtDuration = (ms: number): string => {
  const mins = Math.ceil(ms / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const fmtHours = (ticks: number): string => {
  const mins = ticks * (TICK_MS / 60000);
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${Math.floor(mins / 60)}h`;
};

const timeAgo = (at: number, now: number): string => {
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

const STATUS_STYLE: Record<ColonyStatus, { label: string; cls: string }> = {
  victorious: {
    label: '🏆 Victorious',
    cls: 'bg-yellow-400/25 text-yellow-200 ring-yellow-300/50',
  },
  thriving: {
    label: '✨ Thriving',
    cls: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40',
  },
  stable: {
    label: '🙂 Stable',
    cls: 'bg-amber-500/20 text-amber-200 ring-amber-400/40',
  },
  struggling: {
    label: '⚠️ Struggling',
    cls: 'bg-orange-500/20 text-orange-300 ring-orange-400/40',
  },
  starving: {
    label: '🆘 Starving',
    cls: 'bg-red-500/25 text-red-300 ring-red-400/50 animate-pulse',
  },
  collapsed: {
    label: '☠️ Collapsed',
    cls: 'bg-zinc-600/40 text-zinc-300 ring-zinc-400/40',
  },
};

// ---------- components ----------

const MuteButton = () => {
  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => onMuteChange(setMutedState), []);
  return (
    <button
      onClick={() => {
        setMuted(!muted);
        if (muted) sfx.click();
      }}
      title={muted ? 'Sound off' : 'Sound on'}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/30 text-base ring-1 ring-amber-500/30 transition hover:bg-black/50"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
};

const MusicButton = () => {
  const [on, setOn] = useState(isMusicOn);
  useEffect(() => onMusicChange(setOn), []);
  return (
    <button
      onClick={() => setMusicOn(!on)}
      title={on ? 'Music on' : 'Music off'}
      aria-label={on ? 'Turn music off' : 'Turn music on'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/30 text-base ring-1 ring-amber-500/30 transition hover:bg-black/50 ${on ? '' : 'opacity-40 grayscale'}`}
    >
      🎵
    </button>
  );
};

const Header = ({
  colony,
  status,
  now,
}: {
  colony: Colony;
  status: ColonyStatus;
  now: number;
}) => {
  const nextTick = colony.lastTickAt + TICK_MS - now;
  const s = STATUS_STYLE[status];
  return (
    <header className="flex items-center justify-between gap-2">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight text-amber-300">
          🐝 Hive Colony{' '}
          <span className="text-amber-500/70">#{colony.generation}</span>
        </h1>
        <p className="text-xs text-amber-100/60">
          Day {dayOf(colony)}
          {colony.collapsedAt === null && (
            <> · next tick in {fmtClock(nextTick)}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${s.cls}`}
        >
          {s.label}
        </span>
        <MusicButton />
        <MuteButton />
      </div>
    </header>
  );
};

const Stat = ({
  icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string | undefined;
  warn?: boolean | undefined;
}) => (
  <div
    className={`rounded-xl px-3 py-2 ring-1 ${warn ? 'bg-red-950/50 ring-red-500/40' : 'bg-black/30 ring-amber-500/20'}`}
  >
    <div className="text-[11px] uppercase tracking-wide text-amber-100/50">
      {icon} {label}
    </div>
    <div
      className={`text-xl font-bold tabular-nums ${warn ? 'text-red-300' : 'text-amber-50'}`}
    >
      {value}
    </div>
    {hint && <div className="text-[11px] text-amber-100/50">{hint}</div>}
  </div>
);

const Resources = ({ s }: { s: StateResponse }) => {
  const c = s.colony;
  const eatPerTick = foodEatenPerTick(c);
  const foodTicks = eatPerTick > 0 ? Math.floor(c.food / eatPerTick) : Infinity;
  const passive = passiveOf(c);
  const upkeep = energyUpkeepOf(c);
  const moraleColor =
    c.morale >= 60
      ? 'bg-emerald-400'
      : c.morale >= 40
        ? 'bg-amber-400'
        : 'bg-red-500';
  return (
    <section className="grid grid-cols-2 gap-2">
      <Stat
        icon="🌾"
        label="Food"
        value={String(c.food)}
        hint={
          Number.isFinite(foodTicks)
            ? `lasts ~${fmtHours(foodTicks)}`
            : undefined
        }
        warn={foodTicks < 18}
      />
      <Stat
        icon="👥"
        label="Colonists"
        value={`${c.population}/${s.capacity}`}
        hint={`${buildingCount(c)} buildings`}
        warn={c.population > s.capacity}
      />
      <Stat icon="🪨" label="Materials" value={String(c.materials)} />
      <Stat
        icon="⚡"
        label="Energy"
        value={String(c.energy)}
        warn={c.energy === 0}
        hint={c.energy === 0 ? 'power out — work halved' : undefined}
      />
      <div className="col-span-2 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-amber-500/20">
        <div className="flex justify-between text-[11px] uppercase tracking-wide text-amber-100/50">
          <span>💛 Morale {c.morale}</span>
          <span>
            🔬 Research {c.research} · work ×{s.multiplier.toFixed(2)}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${moraleColor} transition-all`}
            style={{ width: `${c.morale}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-amber-100/50">
          Per hour from buildings: 🌾+{passive.food * 6} 🪨+
          {passive.materials * 6} ⚡
          {passive.energy * 6 - upkeep * 6 >= 0 ? '+' : ''}
          {(passive.energy - upkeep) * 6} 🔬+{passive.research * 6} · eaten 🌾-
          {eatPerTick * 6}
        </div>
      </div>
    </section>
  );
};

const RolePicker = ({
  onPick,
  busy,
  current,
}: {
  onPick: (r: RoleId) => void;
  busy: boolean;
  current: RoleId | null;
}) => (
  <section className="rounded-2xl bg-amber-400/10 p-3 ring-1 ring-amber-400/30">
    <h2 className="mb-2 text-sm font-bold text-amber-200">
      {current ? 'Change your role' : 'Choose your role, colonist'}
    </h2>
    <div className="grid gap-2">
      {ROLES.map((r) => (
        <button
          key={r.id}
          disabled={busy}
          onClick={() => onPick(r.id)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 transition active:scale-[0.98] disabled:opacity-50 ${
            r.id === current
              ? 'bg-amber-400/25 ring-amber-300'
              : 'bg-black/30 ring-amber-500/20 hover:bg-black/50'
          }`}
        >
          <span className="text-2xl">{r.emoji}</span>
          <span>
            <span className="block font-semibold text-amber-50">{r.name}</span>
            <span className="block text-xs text-amber-100/60">{r.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  </section>
);

type WorkPanelProps = {
  s: StateResponse;
  now: number;
  busy: boolean;
  placing: BuildingId | null;
  onPlacing: (b: BuildingId | null) => void;
  onSpecial: (k: SpecialKind) => void;
  onWork: () => void;
  onChangeRole: () => void;
};

type SpecialKind = 'expand' | 'wonder';

const SpecialBuilds = ({
  s,
  placing,
  onPlacing,
  onSpecial,
  disabled,
}: {
  s: StateResponse;
  placing: BuildingId | null;
  onPlacing: (b: BuildingId | null) => void;
  onSpecial: (k: SpecialKind) => void;
  disabled: boolean;
}) => {
  const c = s.colony;
  const exp = expandCheck(c);
  const w = wonderCheck(c);
  const stage = wonderStage(c);
  const btn =
    'min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-[11px] leading-tight font-semibold ring-1 transition disabled:opacity-35';
  return (
    <div className="mt-1.5 flex gap-1.5">
      {c.gridSize < MAX_GRID && (
        <button
          disabled={disabled || !exp.ok}
          onClick={() => onSpecial('expand')}
          title={exp.ok ? 'Grow the island' : exp.reason}
          className={`${btn} bg-emerald-900/40 text-emerald-100 ring-emerald-400/40`}
        >
          🏝️ Expand {c.gridSize + 2}×{c.gridSize + 2} · 🪨{exp.cost ?? '—'}
        </button>
      )}
      {c.wonderDoneAt === null && (
        <button
          disabled={disabled || !w.ok}
          onClick={() =>
            stage === 0
              ? onPlacing(placing === 'wonder' ? null : 'wonder')
              : onSpecial('wonder')
          }
          title={w.ok ? 'Build the Great Hive' : w.reason}
          className={`${btn} ${placing === 'wonder' ? 'bg-yellow-400 text-amber-950 ring-yellow-200' : 'bg-yellow-900/40 text-yellow-100 ring-yellow-400/40'}`}
        >
          🏛️{' '}
          {stage === 0 ? 'Great Hive' : `Stage ${stage + 1}/${WONDER_STAGES}`} ·
          🪨{w.cost ?? '—'}
        </button>
      )}
    </div>
  );
};

const BuildPalette = ({
  s,
  placing,
  onPlacing,
  onSpecial,
  disabled,
}: {
  s: StateResponse;
  placing: BuildingId | null;
  onPlacing: (b: BuildingId | null) => void;
  onSpecial: (k: SpecialKind) => void;
  disabled: boolean;
}) => (
  <div className="mb-2">
    <div className="grid grid-cols-5 gap-1.5">
      {BUILDABLE.map((id) => {
        const def = BUILDINGS[id];
        const affordable = s.colony.materials >= def.cost;
        const active = placing === id;
        return (
          <button
            key={id}
            disabled={disabled || !affordable}
            onClick={() => onPlacing(active ? null : id)}
            title={`${def.name}: ${def.blurb}`}
            className={`flex flex-col items-center rounded-lg py-1.5 ring-1 transition disabled:opacity-35 ${
              active
                ? 'bg-amber-400 text-amber-950 ring-amber-200'
                : 'bg-black/30 ring-amber-500/30 hover:bg-black/50'
            }`}
          >
            <span className="text-xl leading-6">{def.emoji}</span>
            <span className="text-[10px] font-semibold">🪨{def.cost}</span>
          </button>
        );
      })}
    </div>
    <SpecialBuilds
      s={s}
      placing={placing}
      onPlacing={onPlacing}
      onSpecial={onSpecial}
      disabled={disabled}
    />
    <p className="mt-1.5 text-xs text-amber-100/70">
      {placing
        ? `${BUILDINGS[placing].name}: ${BUILDINGS[placing].blurb} Tap a glowing tile on the map ↓`
        : 'Pick a building, then tap a glowing tile on the map. Or just repair:'}
    </p>
  </div>
);

const WorkPanel = ({
  s,
  now,
  busy,
  placing,
  onPlacing,
  onSpecial,
  onWork,
  onChangeRole,
}: WorkPanelProps) => {
  const me = s.me;
  if (!me?.role) return null;
  const role = getRole(me.role);
  const energy = staminaOf(me, now);
  const resting = energy.stamina < 1;
  const wait = energy.nextAt !== null ? energy.nextAt - now : 0;
  return (
    <section className="rounded-2xl bg-gradient-to-b from-amber-400/20 to-amber-600/5 p-3 ring-1 ring-amber-400/40">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-amber-100">
          You are a{' '}
          <b className="text-amber-300">
            {role.emoji} {role.name}
          </b>
        </div>
        <button
          onClick={onChangeRole}
          className="text-xs text-amber-200/60 underline hover:text-amber-200"
        >
          change
        </button>
      </div>
      {role.id === 'builder' && (
        <BuildPalette
          s={s}
          placing={placing}
          onPlacing={onPlacing}
          onSpecial={onSpecial}
          disabled={busy || resting}
        />
      )}
      <button
        onClick={onWork}
        disabled={busy || resting}
        className="w-full rounded-xl bg-amber-400 py-3 text-lg font-extrabold text-amber-950 shadow-lg shadow-amber-500/20 transition active:scale-[0.98] disabled:bg-amber-900/60 disabled:text-amber-200/60 disabled:shadow-none"
      >
        {busy
          ? 'Working…'
          : resting
            ? `😴 Out of stamina · ${fmtClock(wait)}`
            : role.id === 'builder'
              ? '🛠️ Repair (+3 morale)'
              : `${role.emoji} Start Shift`}
      </button>
      <div className="mt-2 flex items-center justify-between text-xs text-amber-100/70">
        <span className="tracking-wider">
          {Array.from({ length: MAX_STAMINA }, (_, i) => (
            <span
              key={i}
              className={i < energy.stamina ? '' : 'opacity-25 grayscale'}
            >
              ⚡
            </span>
          ))}
        </span>
        <span>
          {energy.nextAt !== null
            ? `+1 stamina in ${fmtClock(wait)}`
            : 'Stamina full'}
        </span>
      </div>
      <div className="mt-2 flex justify-between text-xs text-amber-100/60">
        <span>Shifts: {me.shifts}</span>
        <span>Contribution: {me.contribution} pts</span>
      </div>
    </section>
  );
};

/** What a building gives at a given level, as short labels. */
const outputAt = (b: BuildingId, lvl: number): string[] => {
  switch (b) {
    case 'core':
      return ['👥 Houses 5'];
    case 'shelter':
      return [`👥 Houses ${5 * lvl}`];
    case 'farm':
      return [`🌾 +${3 * lvl} food / tick`];
    case 'mine':
      return [`🪨 +${lvl} material${lvl === 1 ? '' : 's'} / tick`];
    case 'solar':
      return [`⚡ +${3 * lvl} energy / tick`];
    case 'lab':
      return [`🔬 +${lvl} research / 2 ticks`];
    case 'wonder':
      return [`👥 Houses ${10 * lvl}`, `🏛️ Stage ${lvl}/${WONDER_STAGES}`];
  }
};

type BuildingCardProps = {
  s: StateResponse;
  index: number;
  now: number;
  busy: boolean;
  onClose: () => void;
  onUpgrade: (i: number) => void;
  onWonder: () => void;
  onBecomeBuilder: () => void;
};

const BuildingCard = ({
  s,
  index,
  now,
  busy,
  onClose,
  onUpgrade,
  onWonder,
  onBecomeBuilder,
}: BuildingCardProps) => {
  const c = s.colony;
  const tile = c.tiles[index];
  if (!tile) return null;
  const def = BUILDINGS[tile.b];
  const isBuilder = s.me?.role === 'builder';
  const energy = s.me ? staminaOf(s.me, now) : null;
  const tired = !energy || energy.stamina < 1;
  const wait = energy?.nextAt ? energy.nextAt - now : 0;
  const collapsed = c.collapsedAt !== null;
  const maxLvl =
    tile.b === 'wonder' ? WONDER_STAGES : tile.b === 'core' ? 1 : MAX_LEVEL;

  const upgradable = canUpgrade(tile);
  const wonder = tile.b === 'wonder' ? wonderCheck(c) : null;
  const nextCost = upgradable
    ? upgradeCost(tile.b, tile.lvl)
    : wonder && c.wonderDoneAt === null
      ? (wonder.cost ?? 0)
      : 0;
  const short = Math.max(0, nextCost - c.materials);

  const actionBtn =
    'w-full rounded-xl py-2.5 text-sm font-extrabold transition active:scale-[0.98] disabled:bg-amber-900/60 disabled:text-amber-200/60';

  let action: ReactNode;
  if (collapsed) {
    action = null;
  } else if (tile.b === 'core') {
    action = (
      <p className="text-center text-xs text-amber-100/60">
        The heart of the hive. It can't be upgraded.
      </p>
    );
  } else if (tile.b === 'wonder' && c.wonderDoneAt !== null) {
    action = (
      <p className="text-center text-sm font-bold text-yellow-300">
        🏆 Complete — the colony has won!
      </p>
    );
  } else if (!upgradable && tile.b !== 'wonder') {
    action = (
      <p className="text-center text-sm font-bold text-amber-300">
        ⭐ Max level reached
      </p>
    );
  } else if (!isBuilder) {
    action = (
      <div className="space-y-1.5">
        <p className="text-center text-xs text-amber-100/60">
          Only 🏗️ Builders can{' '}
          {tile.b === 'wonder' ? 'build the Great Hive' : 'upgrade buildings'}.
        </p>
        {s.username && (
          <button
            disabled={busy}
            onClick={onBecomeBuilder}
            className={`${actionBtn} bg-amber-400/20 text-amber-100 ring-1 ring-amber-400/40`}
          >
            🏗️ Become a Builder
          </button>
        )}
      </div>
    );
  } else {
    const blocked =
      busy || tired || short > 0 || (wonder !== null && !wonder.ok);
    const label =
      tile.b === 'wonder'
        ? `🏛️ Build stage ${tile.lvl + 1}/${WONDER_STAGES} · 🪨${nextCost}`
        : `⬆️ Upgrade to Lv${tile.lvl + 1} · 🪨${nextCost}`;
    const why =
      wonder && !wonder.ok && short === 0
        ? wonder.reason
        : short > 0
          ? `Need ${short} more 🪨 materials — ask the miners!`
          : tired
            ? `Out of stamina · +1 in ${fmtClock(wait)}`
            : 'Costs 1 ⚡ stamina.';
    action = (
      <div className="space-y-1">
        <button
          disabled={blocked}
          onClick={() => (tile.b === 'wonder' ? onWonder() : onUpgrade(index))}
          className={`${actionBtn} bg-amber-400 text-amber-950 shadow-lg shadow-amber-500/20`}
        >
          {busy ? 'Working…' : label}
        </button>
        <p
          className={`text-center text-[11px] ${short > 0 || tired ? 'text-red-300/80' : 'text-amber-100/50'}`}
        >
          {why}
        </p>
      </div>
    );
  }

  const current = outputAt(tile.b, tile.lvl);
  const next =
    tile.lvl < maxLvl && tile.b !== 'core'
      ? outputAt(tile.b, tile.lvl + 1)
      : null;

  return (
    <div className="mt-2 rounded-xl bg-gradient-to-b from-amber-400/15 to-black/30 p-3 ring-1 ring-amber-400/40">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/30 text-3xl ring-1 ring-amber-500/30">
          {def.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-bold text-amber-100">{def.name}</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full px-1.5 text-amber-100/50 hover:text-amber-100"
            >
              ✕
            </button>
          </div>
          {tile.b !== 'core' && (
            <div
              className="text-xs tracking-wider"
              title={`Level ${tile.lvl} of ${maxLvl}`}
            >
              {Array.from({ length: maxLvl }, (_, i) => (
                <span
                  key={i}
                  className={i < tile.lvl ? 'text-amber-300' : 'text-white/15'}
                >
                  ★
                </span>
              ))}
              <span className="ml-1.5 text-amber-100/60">
                {tile.b === 'wonder' ? 'Stage' : 'Lv'} {tile.lvl}/{maxLvl}
              </span>
            </div>
          )}
          <p className="mt-0.5 text-xs text-amber-100/60">{def.blurb}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-black/30 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-100/40">
            Now
          </div>
          {current.map((l) => (
            <div key={l} className="text-amber-50">
              {l}
            </div>
          ))}
        </div>
        <div
          className={`rounded-lg px-2 py-1.5 ${next ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30' : 'bg-black/20'}`}
        >
          <div className="text-[10px] uppercase tracking-wide text-amber-100/40">
            Next level
          </div>
          {next ? (
            next.map((l) => (
              <div key={l} className="text-emerald-300">
                {l}
              </div>
            ))
          ) : (
            <div className="text-amber-100/40">—</div>
          )}
        </div>
      </div>

      {tile.b !== 'core' && (
        <p className="mt-1.5 text-[11px] text-amber-100/40">
          Built by u/{tile.by}, {timeAgo(tile.at, now)} ago
          {tile.b !== 'wonder' && ` · upkeep 🪨${2 * tile.lvl} every 6h`}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

type ColonyMapProps = {
  s: StateResponse;
  placing: BuildingId | null;
  now: number;
  busy: boolean;
  onTile: (i: number) => void;
  onUpgrade: (i: number) => void;
  onWonder: () => void;
  onBecomeBuilder: () => void;
};

const ColonyMap = ({
  s,
  placing,
  now,
  busy,
  onTile,
  onUpgrade,
  onWonder,
  onBecomeBuilder,
}: ColonyMapProps) => {
  const colony = s.colony;
  const [inspect, setInspect] = useState<number | null>(null);
  const selected = inspect !== null && colony.tiles[inspect] ? inspect : null;
  return (
    <section className="rounded-2xl bg-black/30 p-3 ring-1 ring-amber-500/20">
      <h2 className="mb-2 text-sm font-bold text-amber-200">🗺️ Colony map</h2>
      <IsoMap
        colony={colony}
        now={now}
        placing={placing}
        selected={selected}
        onTap={(i) => {
          if (placing !== null && canPlaceAt(colony, i)) onTile(i);
          else {
            const next = colony.tiles[i] && i !== selected ? i : null;
            if (next !== null) sfx.click();
            setInspect(next);
          }
        }}
      />
      {selected !== null ? (
        <BuildingCard
          s={s}
          index={selected}
          now={now}
          busy={busy}
          onClose={() => setInspect(null)}
          onUpgrade={onUpgrade}
          onWonder={onWonder}
          onBecomeBuilder={onBecomeBuilder}
        />
      ) : (
        <p className="mt-2 text-xs text-amber-100/60">
          {placing
            ? '✨ Tap a glowing tile to build there.'
            : '👆 Tap any building to see its details and upgrade it.'}
        </p>
      )}
    </section>
  );
};

type LawsPanelProps = {
  colony: Colony;
  myVote: 'yes' | 'no' | null;
  now: number;
  canVote: boolean;
  busy: boolean;
  onVote: (yes: boolean) => void;
};

const LawsPanel = ({
  colony,
  myVote,
  now,
  canVote,
  busy,
  onVote,
}: LawsPanelProps) => {
  const p = colony.proposal;
  const law = p ? getLaw(p.law) : null;
  const remaining = p
    ? (p.endsAtTick - colony.ticks) * TICK_MS - (now - colony.lastTickAt)
    : 0;
  const total = p ? p.yes + p.no : 0;
  const yesPct = total > 0 && p ? Math.round((p.yes / total) * 100) : 50;
  return (
    <section className="rounded-2xl bg-violet-950/40 p-3 ring-1 ring-violet-400/30">
      <h2 className="mb-2 text-sm font-bold text-violet-200">
        🏛️ Hive Council
      </h2>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {colony.laws.length === 0 ? (
          <span className="text-xs text-violet-100/50">No laws in effect.</span>
        ) : (
          colony.laws.map((id) => {
            const l = getLaw(id);
            return (
              <span
                key={id}
                title={l.effect}
                className="rounded-full bg-violet-500/25 px-2 py-0.5 text-xs text-violet-100 ring-1 ring-violet-400/40"
              >
                {l.emoji} {l.name}
              </span>
            );
          })
        )}
      </div>
      {p && law && (
        <div className="rounded-xl bg-black/30 p-2.5">
          <div className="text-sm text-violet-50">
            <b>Proposal:</b> {p.enact ? 'Enact' : 'Repeal'} {law.emoji}{' '}
            <b>{law.name}</b>
          </div>
          <div className="mt-0.5 text-xs text-violet-100/60">{law.effect}</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
            <div className="bg-emerald-400" style={{ width: `${yesPct}%` }} />
            <div className="bg-red-400" style={{ width: `${100 - yesPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-violet-100/60">
            <span>👍 {p.yes}</span>
            <span>
              closes in {remaining > 0 ? fmtDuration(remaining) : 'a moment'}
            </span>
            <span>👎 {p.no}</span>
          </div>
          {canVote &&
            (myVote ? (
              <p className="mt-2 text-center text-xs text-violet-200">
                You voted {myVote === 'yes' ? '👍 Yes' : '👎 No'}. Results when
                the vote closes.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  disabled={busy}
                  onClick={() => onVote(true)}
                  className="rounded-lg bg-emerald-500/80 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  👍 Yes
                </button>
                <button
                  disabled={busy}
                  onClick={() => onVote(false)}
                  className="rounded-lg bg-red-500/80 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  👎 No
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
};

const LOG_COLOR: Record<LogEntry['kind'], string> = {
  good: 'text-emerald-300',
  bad: 'text-red-300',
  info: 'text-amber-100/80',
  event: 'text-violet-300 font-medium',
};

type LogGroup = { entry: LogEntry; count: number };

/** Merge back-to-back identical messages ("fixed up the colony" ×4). */
const groupLog = (log: LogEntry[]): LogGroup[] => {
  const out: LogGroup[] = [];
  for (const e of log) {
    const last = out[out.length - 1];
    if (last && last.entry.text === e.text) last.count += 1;
    else out.push({ entry: e, count: 1 });
  }
  return out;
};

const LOG_PREVIEW = 6;

const ColonyLog = ({ log, now }: { log: LogEntry[]; now: number }) => {
  const [expanded, setExpanded] = useState(false);
  const groups = groupLog(log);
  const shown = expanded ? groups : groups.slice(0, LOG_PREVIEW);
  const hidden = groups.length - LOG_PREVIEW;
  return (
    <section className="rounded-2xl bg-black/30 p-3 ring-1 ring-amber-500/20">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-amber-200">📜 Colony log</h2>
        <span className="text-[11px] text-amber-100/40">latest first</span>
      </div>
      <ul
        className={`hive-scroll space-y-1 pr-1 text-sm ${expanded ? 'max-h-72 overflow-y-auto' : ''}`}
      >
        {shown.map(({ entry: e, count }, i) => (
          <li
            key={`${e.at}-${i}`}
            className={`flex gap-2 rounded-lg px-1.5 py-1 ${
              e.kind === 'event'
                ? 'bg-violet-500/10'
                : e.kind === 'bad'
                  ? 'bg-red-500/10'
                  : e.kind === 'good'
                    ? 'bg-emerald-500/5'
                    : ''
            }`}
          >
            <span className="w-8 shrink-0 text-right text-[11px] leading-5 text-amber-100/40">
              {timeAgo(e.at, now)}
            </span>
            <span className={`min-w-0 flex-1 ${LOG_COLOR[e.kind]}`}>
              {e.text}
              {count > 1 && (
                <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 py-px text-[10px] font-bold text-amber-200">
                  ×{count}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg bg-amber-400/10 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/30 transition hover:bg-amber-400/20 active:scale-[0.99]"
        >
          {expanded ? '▲ Show less' : `▼ View more (${hidden})`}
        </button>
      )}
    </section>
  );
};

const Leaders = ({
  leaders,
  me,
}: {
  leaders: LeaderEntry[];
  me: string | null;
}) => (
  <section className="rounded-2xl bg-black/30 p-3 ring-1 ring-amber-500/20">
    <h2 className="mb-2 text-sm font-bold text-amber-200">🏆 Top workers</h2>
    {leaders.length === 0 ? (
      <p className="text-sm text-amber-100/50">
        No one has worked yet. Be the first!
      </p>
    ) : (
      <ol className="space-y-1 text-sm">
        {leaders.map((l, i) => (
          <li
            key={l.username}
            className={`flex justify-between ${l.username === me ? 'font-bold text-amber-300' : 'text-amber-50'}`}
          >
            <span>
              {['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} u/{l.username}
              {l.badges > 0 && (
                <span
                  className="ml-1 text-yellow-300"
                  title="Great Hives completed"
                >
                  🏆{l.badges > 1 ? `×${l.badges}` : ''}
                </span>
              )}
            </span>
            <span className="tabular-nums">{l.score}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

const GoalsPanel = ({ s }: { s: StateResponse }) => {
  const c = s.colony;
  const fill = Math.round(fillOf(c) * 100);
  const exp = expandCheck(c);
  const stage = wonderStage(c);
  const wonder = wonderCheck(c);
  const unlocked =
    c.population >= WONDER_REQ.population && c.research >= WONDER_REQ.research;
  return (
    <section className="rounded-2xl bg-black/30 p-3 ring-1 ring-yellow-400/30">
      <h2 className="mb-2 text-sm font-bold text-yellow-200">
        🎯 Colony goals
        {c.prestige > 0 && (
          <span className="ml-2 rounded-full bg-yellow-400/20 px-2 py-0.5 text-[11px] font-semibold text-yellow-200">
            New Game+{c.prestige > 1 ? ` ×${c.prestige}` : ''} · +
            {Math.min(c.prestige, MAX_PRESTIGE_BONUS) * 10}% work
          </span>
        )}
      </h2>
      <div className="space-y-2 text-xs text-amber-100/70">
        <div>
          <div className="flex justify-between">
            <span>
              🏝️ Island {c.gridSize}×{c.gridSize} · {fill}% built
            </span>
            <span>
              {c.gridSize >= MAX_GRID
                ? 'max size'
                : `expand at ${Math.round(EXPAND_FILL * 100)}%`}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${fill}%` }}
            />
          </div>
          {!exp.ok && exp.cost !== null && (
            <div className="mt-0.5 text-amber-100/50">{exp.reason}</div>
          )}
          {exp.ok && (
            <div className="mt-0.5 text-emerald-300">
              Ready! A builder can expand the island for 🪨{exp.cost}.
            </div>
          )}
        </div>
        <div>
          <div className="flex justify-between">
            <span>
              🏛️ Great Hive · stage {stage}/{WONDER_STAGES}
            </span>
            <span>
              {c.wonderDoneAt !== null
                ? '🏆 complete'
                : unlocked
                  ? 'unlocked'
                  : '🔒 locked'}
            </span>
          </div>
          <div className="mt-1 flex gap-1">
            {Array.from({ length: WONDER_STAGES }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < stage ? 'bg-yellow-400' : 'bg-white/10'}`}
              />
            ))}
          </div>
          {c.wonderDoneAt === null && (
            <div className="mt-0.5 text-amber-100/50">
              {unlocked
                ? `Next stage: 🪨${WONDER_STAGE_COSTS[stage] ?? 0} (builders). Finish all ${WONDER_STAGES} to win!`
                : `Unlocks at 👥${WONDER_REQ.population} colonists (now ${c.population}) and 🔬${WONDER_REQ.research} research (now ${c.research}).`}
            </div>
          )}
          {!wonder.ok &&
            unlocked &&
            c.wonderDoneAt === null &&
            wonder.cost !== null &&
            c.materials < wonder.cost && (
              <div className="text-amber-100/50">
                Mine more materials — have 🪨{c.materials}.
              </div>
            )}
        </div>
        {s.records.length > 0 && (
          <div>
            <div className="mb-0.5 font-semibold text-yellow-200">
              🏆 Hall of Fame
            </div>
            {s.records.map((r) => (
              <div key={r.generation} className="flex justify-between">
                <span>Colony #{r.generation}</span>
                <span>
                  Great Hive in {r.days} day{r.days === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const Victory = ({
  colony,
  busy,
  onRefound,
}: {
  colony: Colony;
  busy: boolean;
  onRefound: () => void;
}) => (
  <section className="rounded-2xl bg-gradient-to-b from-yellow-400/30 to-amber-600/10 p-4 text-center ring-2 ring-yellow-300/60">
    <div className="text-4xl">🏆</div>
    <h2 className="mt-1 text-lg font-extrabold text-yellow-200">
      The Great Hive is complete!
    </h2>
    <p className="mt-1 text-sm text-amber-100/80">
      Colony #{colony.generation} won in {dayOf(colony)} day
      {dayOf(colony) === 1 ? '' : 's'}. Everyone who worked earned a 🏆 badge.
    </p>
    <p className="mt-1 text-xs text-amber-100/60">
      Keep playing here, or start a fresh colony with a permanent bonus.
    </p>
    <button
      onClick={onRefound}
      disabled={busy}
      className="mt-3 w-full rounded-xl bg-yellow-400 py-3 font-extrabold text-amber-950 disabled:opacity-50"
    >
      🚀 New Game+ · Colony #{colony.generation + 1} (+
      {Math.min(colony.prestige + 1, MAX_PRESTIGE_BONUS) * 10}% work)
    </button>
  </section>
);

const Collapsed = ({
  colony,
  busy,
  onRefound,
}: {
  colony: Colony;
  busy: boolean;
  onRefound: () => void;
}) => (
  <section className="rounded-2xl bg-zinc-900/80 p-4 text-center ring-1 ring-zinc-500/40">
    <div className="text-4xl">☠️</div>
    <h2 className="mt-1 text-lg font-bold text-zinc-100">
      Colony #{colony.generation} has fallen
    </h2>
    <p className="mt-1 text-sm text-zinc-400">
      It survived {dayOf(colony)} day{dayOf(colony) === 1 ? '' : 's'}. Will the
      next one do better?
    </p>
    <button
      onClick={onRefound}
      disabled={busy}
      className="mt-3 w-full rounded-xl bg-amber-400 py-3 font-extrabold text-amber-950 disabled:opacity-50"
    >
      🚀 Found Colony #{colony.generation + 1}
    </button>
  </section>
);

// ---------- app ----------

export const App = () => {
  const {
    state,
    error,
    busy,
    flash,
    now,
    refresh,
    chooseRole,
    workShift,
    vote,
    refound,
  } = useColony();
  const [changingRole, setChangingRole] = useState(false);
  const [placing, setPlacing] = useState<BuildingId | null>(null);
  const [playing, setPlaying] = useState(false);
  const status = state?.status;

  // Background music: starts on first tap; mood follows the colony.
  useEffect(() => initMusic(), []);
  useEffect(() => {
    if (!status) return;
    setMood(
      status === 'victorious'
        ? 'triumph'
        : status === 'starving' ||
            status === 'struggling' ||
            status === 'collapsed'
          ? 'tense'
          : 'calm'
    );
  }, [status]);

  if (!state) {
    return (
      <div className="hive-bg flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-amber-100">
        <div className="animate-bounce text-5xl">🐝</div>
        {error ? (
          <>
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => void refresh()}
              className="rounded-lg bg-amber-400 px-4 py-2 font-bold text-amber-950"
            >
              Retry
            </button>
          </>
        ) : (
          <p className="text-sm text-amber-100/70">Waking the hive…</p>
        )}
      </div>
    );
  }

  const { colony } = state;
  const collapsed = colony.collapsedAt !== null;
  const needsRole = !state.me?.role || changingRole;
  const myRole = state.me?.role ?? null;
  return (
    <div className="hive-bg min-h-screen overflow-x-hidden text-amber-50">
      {playing && myRole && (
        <MiniGame
          target={MINIGAME_TARGET[myRole]}
          title={`${getRole(myRole).emoji} ${getRole(myRole).name} shift`}
          onDone={(score) => {
            setPlaying(false);
            void workShift({ score });
          }}
        />
      )}
      <main className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-3 p-3 pb-10 sm:p-4">
        <Header colony={colony} status={state.status} now={now} />
        <Resources s={state} />

        {flash && (
          <div
            className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 ${flash.ok ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40' : 'bg-red-500/15 text-red-200 ring-red-400/40'}`}
          >
            {flash.text}
          </div>
        )}

        {colony.wonderDoneAt !== null && !collapsed && (
          <Victory
            colony={colony}
            busy={busy}
            onRefound={() => void refound()}
          />
        )}

        {collapsed ? (
          <Collapsed
            colony={colony}
            busy={busy}
            onRefound={() => void refound()}
          />
        ) : !state.username ? (
          <p className="rounded-xl bg-black/30 p-3 text-center text-sm text-amber-100/70">
            Log in to Reddit to join the colony.
          </p>
        ) : needsRole ? (
          <RolePicker
            busy={busy}
            current={state.me?.role ?? null}
            onPick={(r) => {
              setChangingRole(false);
              void chooseRole(r);
            }}
          />
        ) : (
          <WorkPanel
            s={state}
            now={now}
            busy={busy}
            placing={placing}
            onPlacing={setPlacing}
            onSpecial={(kind) => {
              setPlacing(null);
              void workShift({
                build:
                  kind === 'expand' ? { kind: 'expand' } : { kind: 'wonder' },
              });
            }}
            onWork={() =>
              myRole === 'builder' ? void workShift() : setPlaying(true)
            }
            onChangeRole={() => {
              setPlacing(null);
              setChangingRole(true);
            }}
          />
        )}

        <ColonyMap
          s={state}
          placing={state.me?.role === 'builder' && !collapsed ? placing : null}
          now={now}
          busy={busy}
          onUpgrade={(tile) =>
            void workShift({ build: { kind: 'upgrade', tile } })
          }
          onWonder={() => void workShift({ build: { kind: 'wonder' } })}
          onBecomeBuilder={() => void chooseRole('builder')}
          onTile={(tile) => {
            if (!placing) return;
            void workShift({
              build:
                placing === 'wonder'
                  ? { kind: 'wonder', tile }
                  : { kind: 'build', building: placing, tile },
            }).then((ok) => {
              if (ok) setPlacing(null);
            });
          }}
        />

        {!collapsed && (
          <LawsPanel
            colony={colony}
            myVote={state.myVote}
            now={now}
            canVote={Boolean(state.username)}
            busy={busy}
            onVote={(yes) => {
              if (colony.proposal) void vote(colony.proposal.id, yes);
            }}
          />
        )}

        {!collapsed && <GoalsPanel s={state} />}

        <ColonyLog log={colony.log} now={now} />
        <Leaders leaders={state.leaders} me={state.username} />
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
