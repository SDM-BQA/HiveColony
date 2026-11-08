import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { canPlaceAt } from '../../shared/game';
import type { Colony, BuildingId } from '../../shared/game';
import { hitTest, makeView, orderFor, tileCenter } from './iso';
import type { View } from './iso';
import {
  drawBuilding,
  drawDecor,
  drawGround,
  drawHighlight,
  drawIsland,
  drawMeteors,
  drawNight,
  drawRain,
  emoji,
  nightLevel,
} from './draw';
import type { Light } from './draw';

const MAX_BEES = 10;
const POP_MS = 900;
const STORM_MS = 60 * 60 * 1000;
const METEOR_MS = 30 * 60 * 1000;

type Bee = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  phase: number;
};

type Props = {
  colony: Colony;
  now: number; // server-synced clock
  placing: BuildingId | null;
  selected: number | null;
  onTap: (tile: number) => void;
};

const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

const recentEvent = (
  colony: Colony,
  prefix: string,
  now: number,
  within: number
) =>
  colony.log.some(
    (e) =>
      e.kind === 'event' && e.text.startsWith(prefix) && now - e.at < within
  );

export const IsoMap = ({ colony, now, placing, selected, onTap }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(makeView(320, colony.gridSize));
  const resizeRef = useRef<() => void>(() => {});
  const propsRef = useRef({ colony, now, placing, selected });
  const nowSync = useRef({ server: now, local: 0 });
  const bees = useRef<Bee[]>([]);

  // Keep the latest props for the animation loop without restarting it.
  useEffect(() => {
    propsRef.current = { colony, now, placing, selected };
    nowSync.current = { server: now, local: performance.now() };
  }, [colony, now, placing, selected]);

  // Size the canvas to its container (crisp on high-DPI screens).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const W = wrap.clientWidth;
      const v = makeView(W, propsRef.current.colony.gridSize);
      bees.current = [];
      viewRef.current = v;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(v.W * dpr);
      canvas.height = Math.round(v.H * dpr);
      canvas.style.width = `${v.W}px`;
      canvas.style.height = `${v.H}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeRef.current = resize;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();

    const frame = (ms: number) => {
      const dt = Math.min(0.1, (ms - last) / 1000);
      last = ms;
      const t = ms / 1000;
      const { colony: c, placing: pl, selected: sel } = propsRef.current;
      if (viewRef.current.n !== c.gridSize) resizeRef.current(); // island grew
      const v = viewRef.current;
      const drawOrder = orderFor(v.n);
      const serverNow = nowSync.current.server + (ms - nowSync.current.local);
      const lights: Light[] = [];

      ctx.clearRect(0, 0, v.W, v.H);
      drawIsland(ctx, v);

      for (const i of drawOrder) drawGround(ctx, v, i);
      if (pl)
        for (const i of drawOrder)
          if (canPlaceAt(c, i)) drawHighlight(ctx, v, i, t, 'build');
      if (sel !== null) drawHighlight(ctx, v, sel, t, 'select');

      for (const i of drawOrder) {
        const tile = c.tiles[i];
        if (!tile) {
          drawDecor(ctx, v, i, t);
          continue;
        }
        const age = serverNow - tile.at;
        const grow =
          age >= 0 && age < POP_MS
            ? Math.max(0.05, easeOutBack(age / POP_MS))
            : 1;
        drawBuilding(ctx, v, i, tile, t, grow, lights);
      }

      // Bees fly between buildings.
      const built = c.tiles
        .map((tile, i) => (tile ? i : -1))
        .filter((i) => i >= 0);
      const want = Math.min(Math.ceil(c.population / 3), MAX_BEES);
      const pick = () => {
        const i = built[Math.floor(Math.random() * built.length)] ?? 0;
        const p = tileCenter(v, i);
        return {
          x: p.x + (Math.random() - 0.5) * v.tw * 0.4,
          y: p.y - v.th * (0.4 + Math.random() * 0.8),
        };
      };
      while (bees.current.length < want) {
        const start = pick();
        const target = pick();
        bees.current.push({
          x: start.x,
          y: start.y,
          tx: target.x,
          ty: target.y,
          speed: v.tw * (0.5 + Math.random() * 0.5),
          phase: Math.random() * 10,
        });
      }
      if (bees.current.length > want) bees.current.length = want;
      for (const b of bees.current) {
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 2) {
          const n = pick();
          b.tx = n.x;
          b.ty = n.y;
        } else {
          const step = Math.min(d, b.speed * dt);
          b.x += (dx / d) * step;
          b.y += (dy / d) * step;
        }
        const bob = Math.sin(t * 8 + b.phase) * 2;
        ctx.save();
        if (dx < 0) {
          ctx.translate(b.x, 0);
          ctx.scale(-1, 1);
          ctx.translate(-b.x, 0);
        }
        emoji(ctx, '🐝', b.x, b.y + bob, Math.max(9, v.tw * 0.16));
        ctx.restore();
      }

      // Weather and time of day.
      if (recentEvent(c, '⛈️', serverNow, STORM_MS)) drawRain(ctx, v, t);
      if (recentEvent(c, '☄️', serverNow, METEOR_MS)) drawMeteors(ctx, v, t);
      drawNight(ctx, v, nightLevel(new Date()), lights, t);

      if (c.collapsedAt !== null) {
        ctx.fillStyle = 'rgba(20,20,20,0.55)';
        ctx.fillRect(0, 0, v.W, v.H);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tile = hitTest(
      viewRef.current,
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    if (tile !== null) onTap(tile);
  };

  return (
    <div
      ref={wrapRef}
      className="w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-900/60 via-sky-950/40 to-transparent"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        className="block touch-manipulation"
      />
    </div>
  );
};
