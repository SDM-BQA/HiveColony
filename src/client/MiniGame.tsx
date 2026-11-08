import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from './sound';

const DURATION_MS = 10_000;
const SPAWN_MS = 550;
const LIFE_MS = 1100;
const FX_MS = 250;
const CELLS = 9;
const DECOY = '🦂';
const DECOY_CHANCE = 0.2;

type Cell = {
  emoji: string;
  kind: 'good' | 'bad' | 'fx';
  until: number;
} | null;

type Props = {
  target: string;
  title: string;
  onDone: (score: number) => void;
};

/** 10-second tapping game. Score 0..1 = share of targets hit, minus decoys tapped. */
export const MiniGame = ({ target, title, onDone }: Props) => {
  const [cells, setCells] = useState<Cell[]>(() =>
    Array.from({ length: CELLS }, () => null)
  );
  const [left, setLeft] = useState(DURATION_MS);
  const [hits, setHits] = useState(0);
  const cellsRef = useRef<Cell[]>(cells);
  const stats = useRef({ spawned: 0, hits: 0, bad: 0, streak: 0 });
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const commit = useCallback((next: Cell[]) => {
    cellsRef.current = next;
    setCells(next);
  }, []);

  useEffect(() => {
    const start = Date.now();
    stats.current = { spawned: 0, hits: 0, bad: 0, streak: 0 };
    finished.current = false;

    const spawn = window.setInterval(() => {
      const now = Date.now();
      const next = cellsRef.current.map((c) => (c && c.until > now ? c : null));
      const empty = next.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
      const idx = empty[Math.floor(Math.random() * empty.length)];
      if (idx !== undefined) {
        const good = Math.random() >= DECOY_CHANCE;
        if (good) stats.current.spawned += 1;
        next[idx] = {
          emoji: good ? target : DECOY,
          kind: good ? 'good' : 'bad',
          until: now + LIFE_MS,
        };
      }
      commit(next);
    }, SPAWN_MS);

    const clock = window.setInterval(() => {
      const remaining = DURATION_MS - (Date.now() - start);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !finished.current) {
        finished.current = true;
        window.clearInterval(spawn);
        window.clearInterval(clock);
        const s = stats.current;
        const score =
          s.spawned > 0
            ? Math.max(0, Math.min(1, (s.hits - s.bad) / s.spawned))
            : 0.5;
        onDoneRef.current(score);
      }
    }, 100);

    return () => {
      window.clearInterval(spawn);
      window.clearInterval(clock);
    };
  }, [target, commit]);

  const tap = useCallback(
    (i: number) => {
      const cell = cellsRef.current[i];
      const now = Date.now();
      if (!cell || cell.kind === 'fx' || cell.until <= now || finished.current)
        return;
      const next = [...cellsRef.current];
      if (cell.kind === 'good') {
        stats.current.hits += 1;
        sfx.hit(stats.current.streak);
        stats.current.streak += 1;
        setHits(stats.current.hits);
        next[i] = { emoji: '✨', kind: 'fx', until: now + FX_MS };
      } else {
        stats.current.bad += 1;
        stats.current.streak = 0;
        sfx.bad();
        next[i] = { emoji: '💥', kind: 'fx', until: now + FX_MS };
      }
      commit(next);
    },
    [commit]
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs text-center">
        <h2 className="text-lg font-extrabold text-amber-300">{title}</h2>
        <p className="text-xs text-amber-100/70">
          Tap every {target} — avoid the {DECOY}!
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-amber-400 transition-[width] duration-100"
            style={{ width: `${(left / DURATION_MS) * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-amber-100/70">
          <span>{(left / 1000).toFixed(1)}s</span>
          <span>
            {target} × {hits}
          </span>
        </div>
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        {cells.map((c, i) => (
          <button
            key={i}
            onPointerDown={() => tap(i)}
            className={`flex aspect-square select-none items-center justify-center rounded-2xl text-4xl transition ${
              c?.kind === 'good'
                ? 'scale-100 bg-amber-400/30 ring-2 ring-amber-300'
                : c?.kind === 'bad'
                  ? 'scale-100 bg-red-500/25 ring-2 ring-red-400'
                  : 'bg-white/5 ring-1 ring-white/10'
            }`}
          >
            {c?.emoji ?? ''}
          </button>
        ))}
      </div>
      <button
        onClick={() => onDoneRef.current(0.3)}
        className="text-xs text-amber-100/50 underline"
      >
        Skip mini-game (×0.8 output)
      </button>
    </div>
  );
};
