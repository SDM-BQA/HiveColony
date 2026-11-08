// Isometric geometry helpers for the colony map (pure, no React).

export type View = {
  n: number; // grid size (tiles per side)
  W: number; // CSS pixels
  H: number;
  tw: number; // tile width
  th: number; // tile height (tw / 2)
  x0: number; // x of the grid's top corner
  y0: number; // y of the grid's top corner
};

export const makeView = (W: number, n: number): View => {
  const tw = W / (n + 0.5);
  const th = tw / 2;
  const top = tw * 1.6; // headroom for tall buildings (and the Great Hive) on the back row
  const H = top + n * th + th * 2.3; // + island slab and rock tip
  return { n, W, H, tw, th, x0: W / 2, y0: top };
};

export const rowCol = (i: number, n: number) => ({
  r: Math.floor(i / n),
  c: i % n,
});

/** Centre of a tile's diamond. */
export const tileCenter = (v: View, i: number) => {
  const { r, c } = rowCol(i, v.n);
  return {
    x: v.x0 + ((c - r) * v.tw) / 2,
    y: v.y0 + ((c + r) * v.th) / 2 + v.th / 2,
  };
};

/** Which tile is under a point, or null. */
export const hitTest = (v: View, px: number, py: number): number | null => {
  const u = (px - v.x0) / (v.tw / 2);
  const w = (py - v.y0) / (v.th / 2);
  const c = Math.floor((u + w) / 2);
  const r = Math.floor((w - u) / 2);
  if (r < 0 || c < 0 || r >= v.n || c >= v.n) return null;
  return r * v.n + c;
};

const orders = new Map<number, number[]>();

/** Painter's order (back tiles first) for an n×n grid. */
export const orderFor = (n: number): number[] => {
  let order = orders.get(n);
  if (!order) {
    order = Array.from({ length: n * n }, (_, i) => i).sort((a, b) => {
      const A = rowCol(a, n);
      const B = rowCol(b, n);
      return A.r + A.c - (B.r + B.c) || A.r - B.r;
    });
    orders.set(n, order);
  }
  return order;
};

/** Stable pseudo-random 0..1 per integer (for terrain decoration). */
export const hash01 = (n: number): number => {
  let x = (n + 1) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 10000) / 10000;
};
