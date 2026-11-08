// Canvas drawing for the isometric colony map.
import { BUILDINGS, WONDER_STAGES } from '../../shared/game';
import type { BuildingId, Tile } from '../../shared/game';
import { hash01, tileCenter } from './iso';
import type { View } from './iso';

type Ctx = CanvasRenderingContext2D;

const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

const diamond = (ctx: Ctx, cx: number, cy: number, hw: number, hh: number) => {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
};

/** An isometric box standing on (cx, cy). Returns the y of its top face centre. */
const box = (
  ctx: Ctx,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  h: number,
  color: string
): number => {
  // left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh - h);
  ctx.lineTo(cx - hw, cy - h);
  ctx.closePath();
  ctx.fillStyle = shade(color, 0.78);
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(cx, cy + hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx + hw, cy - h);
  ctx.lineTo(cx, cy + hh - h);
  ctx.closePath();
  ctx.fillStyle = shade(color, 0.6);
  ctx.fill();
  // top
  diamond(ctx, cx, cy - h, hw, hh);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  return cy - h;
};

const roof = (
  ctx: Ctx,
  cx: number,
  topY: number,
  hw: number,
  hh: number,
  peak: number,
  color: string
) => {
  ctx.beginPath();
  ctx.moveTo(cx - hw, topY);
  ctx.lineTo(cx, topY + hh);
  ctx.lineTo(cx, topY - peak);
  ctx.closePath();
  ctx.fillStyle = shade(color, 0.85);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, topY + hh);
  ctx.lineTo(cx + hw, topY);
  ctx.lineTo(cx, topY - peak);
  ctx.closePath();
  ctx.fillStyle = shade(color, 0.65);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - hw, topY);
  ctx.lineTo(cx, topY - hh);
  ctx.lineTo(cx + hw, topY);
  ctx.lineTo(cx, topY - peak);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

export const emoji = (
  ctx: Ctx,
  ch: string,
  x: number,
  y: number,
  size: number
) => {
  ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
};

// ---------- terrain ----------

const GRASS = ['#4f7a35', '#557f39', '#4a7432', '#5a843c'];

export const drawIsland = (ctx: Ctx, v: View) => {
  const last = v.n - 1;
  const right = tileCenter(v, last);
  const bottom = tileCenter(v, v.n * v.n - 1);
  const left = tileCenter(v, last * v.n);
  const L = { x: left.x - v.tw / 2, y: left.y };
  const B = { x: bottom.x, y: bottom.y + v.th / 2 };
  const R = { x: right.x + v.tw / 2, y: right.y };
  const depth = v.th * 0.9;
  // soil sides
  ctx.beginPath();
  ctx.moveTo(L.x, L.y);
  ctx.lineTo(B.x, B.y);
  ctx.lineTo(B.x, B.y + depth);
  ctx.lineTo(L.x, L.y + depth * 0.6);
  ctx.closePath();
  ctx.fillStyle = '#7a5532';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(B.x, B.y);
  ctx.lineTo(R.x, R.y);
  ctx.lineTo(R.x, R.y + depth * 0.6);
  ctx.lineTo(B.x, B.y + depth);
  ctx.closePath();
  ctx.fillStyle = '#5e4026';
  ctx.fill();
  // rock tip underneath
  ctx.beginPath();
  ctx.moveTo(L.x + v.tw, L.y + depth * 0.6);
  ctx.lineTo(B.x, B.y + depth);
  ctx.lineTo(R.x - v.tw, R.y + depth * 0.6);
  ctx.lineTo(B.x, B.y + depth * 2.1);
  ctx.closePath();
  ctx.fillStyle = '#4a3220';
  ctx.fill();
};

export const drawGround = (ctx: Ctx, v: View, i: number) => {
  const { x, y } = tileCenter(v, i);
  diamond(ctx, x, y, v.tw / 2, v.th / 2);
  ctx.fillStyle = GRASS[Math.floor(hash01(i) * GRASS.length)] ?? GRASS[0]!;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
};

/** Trees, rocks and flowers on empty tiles. */
export const drawDecor = (ctx: Ctx, v: View, i: number, t: number) => {
  const h = hash01(i * 7 + 3);
  const { x, y } = tileCenter(v, i);
  const ox = (hash01(i * 13) - 0.5) * v.tw * 0.3;
  const oy = (hash01(i * 17) - 0.5) * v.th * 0.3;
  if (h < 0.2) {
    const sway = Math.sin(t * 1.5 + i) * v.tw * 0.015;
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(
      x + ox - v.tw * 0.025,
      y + oy - v.th * 0.5,
      v.tw * 0.05,
      v.th * 0.5
    );
    ctx.beginPath();
    ctx.arc(x + ox + sway, y + oy - v.th * 0.75, v.tw * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#2f5f2a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      x + ox + sway - v.tw * 0.04,
      y + oy - v.th * 0.82,
      v.tw * 0.07,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = '#3f7a35';
    ctx.fill();
  } else if (h < 0.3) {
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, v.tw * 0.09, v.th * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8a8d92';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      x + ox - v.tw * 0.02,
      y + oy - v.th * 0.04,
      v.tw * 0.05,
      v.th * 0.06,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = '#a5a8ad';
    ctx.fill();
  } else if (h < 0.38) {
    const colors = ['#f4d35e', '#ee6c4d', '#f7f7ff'];
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = colors[k % colors.length]!;
      ctx.fillRect(
        x + ox + (hash01(i + k) - 0.5) * v.tw * 0.3,
        y + oy + (hash01(i * 3 + k) - 0.5) * v.th * 0.3,
        2,
        2
      );
    }
  }
};

// ---------- buildings ----------

export type Light = { x: number; y: number; r: number; color: string };

const COLORS: Record<BuildingId, string> = {
  core: '#f5b70a',
  shelter: '#c98b4a',
  farm: '#7a5230',
  mine: '#7d7f86',
  solar: '#1f3b73',
  lab: '#d8e6ee',
  wonder: '#f2e3b3',
};

/**
 * Draw one building. `grow` (0..1+) is the pop-in animation scale.
 * Pushes night-time lights into `lights`.
 */
export const drawBuilding = (
  ctx: Ctx,
  v: View,
  i: number,
  tile: NonNullable<Tile>,
  t: number,
  grow: number,
  lights: Light[]
) => {
  const { x, y } = tileCenter(v, i);
  const k = 0.72 * grow;
  const hw = (v.tw / 2) * k;
  const hh = (v.th / 2) * k;
  const lvl = tile.lvl;
  const tall = (1 + 0.5 * (lvl - 1)) * grow;
  const color = COLORS[tile.b];
  let topY = y;

  switch (tile.b) {
    case 'core': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      ctx.beginPath();
      ctx.ellipse(x, y, hw * 1.25, hh * 1.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251,191,36,${0.15 + pulse * 0.2})`;
      ctx.fill();
      topY = box(ctx, x, y, hw * 1.05, hh * 1.05, v.th * 1.1 * grow, color);
      topY = box(
        ctx,
        x,
        topY,
        hw * 0.6,
        hh * 0.6,
        v.th * 0.45 * grow,
        '#ffd54a'
      );
      lights.push({
        x,
        y: topY,
        r: v.tw * 0.5,
        color: 'rgba(255,200,60,0.55)',
      });
      break;
    }
    case 'shelter': {
      topY = box(ctx, x, y, hw, hh, v.th * 0.55 * tall, color);
      roof(ctx, x, topY, hw * 1.05, hh * 1.05, v.th * 0.45 * grow, '#9b3d2b');
      // window on the right face
      const wx = x + hw * 0.45;
      const wy = y - v.th * 0.25 * tall + hh * 0.3;
      ctx.fillStyle = '#3a2614';
      ctx.fillRect(wx - 2, wy - 3, 4, 5);
      lights.push({
        x: wx,
        y: wy,
        r: v.tw * 0.18,
        color: 'rgba(255,190,90,0.9)',
      });
      break;
    }
    case 'farm': {
      diamond(ctx, x, y, hw * 1.15, hh * 1.15);
      ctx.fillStyle = color;
      ctx.fill();
      // crop rows
      const rows = 3 + lvl;
      for (let row = 0; row < rows; row++) {
        const f = (row + 0.5) / rows - 0.5;
        const sx = x + f * hw * 1.15;
        const sy = y + f * hh * 1.15;
        for (let p = -2; p <= 2; p++) {
          const px = sx + (p * hw * 0.42) / 2;
          const py = sy - (p * hh * 0.42) / 2;
          const sway = Math.sin(t * 2.2 + row + p * 0.7) * 1.5;
          ctx.strokeStyle = lvl >= 3 ? '#e2c044' : '#7cc24a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + sway, py - v.th * 0.22 * grow);
          ctx.stroke();
        }
      }
      break;
    }
    case 'mine': {
      topY = box(ctx, x, y, hw, hh, v.th * 0.5 * tall, color);
      // dark entrance
      ctx.beginPath();
      ctx.ellipse(
        x - hw * 0.45,
        y - v.th * 0.1,
        hw * 0.22,
        hh * 0.45,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#1d1d22';
      ctx.fill();
      // smoke puffs rising from the top
      for (let p = 0; p < 3; p++) {
        const phase = (t * 0.45 + p / 3 + hash01(i)) % 1;
        ctx.beginPath();
        ctx.arc(
          x + hw * 0.3 + Math.sin(phase * 6) * 3,
          topY - phase * v.th * 1.4,
          2 + phase * v.tw * 0.08,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = `rgba(200,200,205,${0.55 * (1 - phase)})`;
        ctx.fill();
      }
      lights.push({
        x: x - hw * 0.45,
        y: y - v.th * 0.1,
        r: v.tw * 0.15,
        color: 'rgba(255,140,40,0.7)',
      });
      break;
    }
    case 'solar': {
      const n = lvl;
      for (let p = 0; p < n; p++) {
        const off = (p - (n - 1) / 2) * hw * 0.55;
        const px = x + off;
        const py = y - off * 0.5;
        topY = box(
          ctx,
          px,
          py,
          hw * 0.45,
          hh * 0.45,
          v.th * 0.2 * grow,
          '#9aa3ad'
        );
        diamond(ctx, px, topY - 1, hw * 0.55, hh * 0.55);
        ctx.fillStyle = color;
        ctx.fill();
        // moving shine
        const s = ((t * 0.5 + p * 0.3) % 1.6) - 0.3;
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(160,210,255,0.45)';
        ctx.fillRect(px - hw + s * hw * 2, topY - hh, hw * 0.25, hh * 2);
        ctx.restore();
      }
      break;
    }
    case 'lab': {
      topY = box(ctx, x, y, hw, hh, v.th * 0.8 * tall, color);
      ctx.beginPath();
      ctx.ellipse(x, topY, hw * 0.55, hh * 0.55, 0, Math.PI, 0);
      ctx.fillStyle = '#9fd8e8';
      ctx.fill();
      const blink = Math.sin(t * 4 + i) > 0.3;
      ctx.beginPath();
      ctx.arc(x, topY - hh * 0.6, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = blink ? '#4ff0ff' : '#1d6b75';
      ctx.fill();
      if (blink)
        lights.push({
          x,
          y: topY - hh * 0.6,
          r: v.tw * 0.2,
          color: 'rgba(80,240,255,0.7)',
        });
      break;
    }
    case 'wonder': {
      const done = lvl >= WONDER_STAGES;
      if (done) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
        ctx.beginPath();
        ctx.ellipse(x, y, hw * 1.6, hh * 1.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,90,${0.2 + pulse * 0.25})`;
        ctx.fill();
      }
      // stepped tiers, one per stage
      topY = y;
      for (let s = 0; s < lvl; s++) {
        const k2 = 1.25 - s * 0.2;
        topY = box(
          ctx,
          x,
          topY,
          hw * k2,
          hh * k2,
          v.th * 0.38 * grow,
          s % 2 === 0 ? color : '#e8c15a'
        );
      }
      if (!done) {
        // scaffolding around the top tier
        ctx.strokeStyle = 'rgba(120,80,40,0.9)';
        ctx.lineWidth = 1;
        const sw = hw * (1.25 - (lvl - 1) * 0.2) * 1.1;
        for (const dx of [-sw, sw]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, topY + v.th * 0.38);
          ctx.lineTo(x + dx, topY - v.th * 0.3);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x - sw, topY - v.th * 0.1);
        ctx.lineTo(x + sw, topY - v.th * 0.1);
        ctx.stroke();
      } else {
        // golden crown + orbiting sparkles
        topY = box(ctx, x, topY, hw * 0.3, hh * 0.3, v.th * 0.5, '#ffd54a');
        ctx.beginPath();
        ctx.arc(x, topY - hh * 0.4, v.tw * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = '#fff3b0';
        ctx.fill();
        for (let p = 0; p < 6; p++) {
          const a = t * 1.2 + (p * Math.PI) / 3;
          ctx.fillStyle = 'rgba(255,240,170,0.9)';
          ctx.fillRect(
            x + Math.cos(a) * hw * 1.4 - 1,
            topY + Math.sin(a) * hh * 1.2 - 1,
            2.5,
            2.5
          );
        }
        lights.push({
          x,
          y: topY,
          r: v.tw * 0.9,
          color: 'rgba(255,215,90,0.7)',
        });
      }
      break;
    }
  }

  // level pips
  if (lvl > 1 && tile.b !== 'core') {
    for (let p = 0; p < lvl; p++) {
      ctx.beginPath();
      ctx.arc(x - (lvl - 1) * 3 + p * 6, y + hh + 4, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
    }
  }

  // floating icon so buildings are easy to tell apart
  const bob = Math.sin(t * 2 + i) * 1.5;
  ctx.globalAlpha = 0.95;
  emoji(
    ctx,
    BUILDINGS[tile.b].emoji,
    x,
    Math.min(topY, y - v.th * 0.3) - v.th * 0.45 + bob,
    v.tw * 0.22 * Math.min(1, grow)
  );
  ctx.globalAlpha = 1;
};

// ---------- overlays ----------

export const drawHighlight = (
  ctx: Ctx,
  v: View,
  i: number,
  t: number,
  kind: 'build' | 'select'
) => {
  const { x, y } = tileCenter(v, i);
  diamond(ctx, x, y, v.tw / 2 - 1, v.th / 2 - 1);
  if (kind === 'build') {
    ctx.fillStyle = `rgba(251,191,36,${0.25 + 0.2 * Math.sin(t * 5)})`;
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = '#fff7d6';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};

/** 0 (day) .. ~0.55 (deep night), from the viewer's local clock. */
export const nightLevel = (date: Date): number => {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 20) return ((h - 18) / 2) * 0.5;
  if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.5;
  return 0.5;
};

export const drawNight = (
  ctx: Ctx,
  v: View,
  level: number,
  lights: Light[],
  t: number
) => {
  if (level <= 0) return;
  ctx.fillStyle = `rgba(12,18,48,${level})`;
  ctx.fillRect(0, 0, v.W, v.H);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, l.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = Math.min(1, level * 2);
    ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // twinkling stars in the sky area
  for (let s = 0; s < 18; s++) {
    const sx = hash01(s * 11) * v.W;
    const sy = hash01(s * 19) * v.y0 * 0.9;
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + s);
    ctx.fillStyle = `rgba(255,255,255,${level * tw})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
};

export const drawRain = (ctx: Ctx, v: View, t: number) => {
  ctx.fillStyle = 'rgba(30,40,60,0.18)';
  ctx.fillRect(0, 0, v.W, v.H);
  ctx.strokeStyle = 'rgba(180,200,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = 0; d < 90; d++) {
    const speed = 0.9 + hash01(d) * 0.5;
    const yy = ((hash01(d * 5) + t * speed) % 1) * (v.H + 20) - 10;
    const xx = (hash01(d * 9) * v.W + yy * 0.25) % v.W;
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx - 3, yy + 9);
  }
  ctx.stroke();
};

export const drawMeteors = (ctx: Ctx, v: View, t: number) => {
  for (let m = 0; m < 2; m++) {
    const cycle = 2.6 + m;
    const p = ((t + m * 1.3) % cycle) / cycle;
    if (p > 0.35) continue;
    const q = p / 0.35;
    const sx =
      v.W * (0.15 + 0.5 * hash01(Math.floor((t + m * 1.3) / cycle) + m * 100));
    const x = sx + q * v.W * 0.35;
    const y = q * v.y0 * 1.1;
    const g = ctx.createLinearGradient(x - 40, y - 20, x, y);
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(1, 'rgba(255,230,180,0.95)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 40, y - 20);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
};
