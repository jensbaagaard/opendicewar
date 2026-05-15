/**
 * Canvas-drawn d6 in isometric perspective: front face + visible top face + visible right face.
 * Pips drawn in the standard die layout. Body is tinted by the owner's color.
 */

export const DIE_SIZE = 16; // front face edge length in px
export const DIE_DEPTH = 6; // isometric offset
export const DIE_STACK_GAP = 2; // visible gap between stacked dice

const PIP_POSITIONS: Array<[number, number]> = [
  [0.25, 0.25], // 0 top-left
  [0.5, 0.25],  // 1 top-mid
  [0.75, 0.25], // 2 top-right
  [0.25, 0.5],  // 3 mid-left
  [0.5, 0.5],   // 4 center
  [0.75, 0.5],  // 5 mid-right
  [0.25, 0.75], // 6 bot-left
  [0.5, 0.75],  // 7 bot-mid
  [0.75, 0.75], // 8 bot-right
];

const PIP_PATTERNS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Draws an isometric die. `bx, by` is the bottom-left of the front face.
 * Top face shows `topValue`; front face shows `frontValue`. Use frontValue=0 to
 * suppress front pips (default — matches the original tower look where only
 * the topmost pip is visible).
 */
export function drawDie3D(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  size: number,
  color: string,
  topValue: number = 1,
  frontValue: number = 0,
) {
  const w = size;
  const h = size;
  const d = Math.max(4, size * 0.42);

  const front = color;
  const right = shade(color, 0.7);
  const top = shade(color, 1.18);

  // Right face (parallelogram)
  ctx.fillStyle = right;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(bx + w, by);
  ctx.lineTo(bx + w + d, by - d);
  ctx.lineTo(bx + w + d, by - h - d);
  ctx.lineTo(bx + w, by - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top face (parallelogram)
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(bx, by - h);
  ctx.lineTo(bx + d, by - h - d);
  ctx.lineTo(bx + w + d, by - h - d);
  ctx.lineTo(bx + w, by - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front face
  ctx.fillStyle = front;
  ctx.fillRect(bx, by - h, w, h);
  ctx.strokeRect(bx, by - h, w, h);

  // Pips on top face — rendered onto a slightly skewed parallelogram.
  if (topValue > 0) drawPipsOnTop(ctx, bx, by - h, w, d, topValue);
  if (frontValue > 0) drawPipsOnFront(ctx, bx, by - h, w, h, frontValue);
}

function drawPipsOnFront(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
) {
  const pattern = PIP_PATTERNS[value];
  if (!pattern) return;
  const r = Math.max(1.4, w * 0.085);
  ctx.fillStyle = "#fafafa";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.6;
  for (const i of pattern) {
    const [px, py] = PIP_POSITIONS[i]!;
    ctx.beginPath();
    ctx.arc(x + px * w, y + py * h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPipsOnTop(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  w: number,
  d: number,
  value: number,
) {
  const pattern = PIP_PATTERNS[value];
  if (!pattern) return;
  const r = Math.max(1.3, w * 0.08);
  ctx.fillStyle = "#fafafa";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.6;
  // Map (u, v) in [0,1]^2 on the top face to canvas xy.
  // Top corners: P00=(fx,fy), P10=(fx+w,fy), P01=(fx+d, fy-d), P11=(fx+w+d, fy-d)
  const toXY = (u: number, v: number) => ({
    x: fx + u * w + v * d,
    y: fy - v * d,
  });
  for (const i of pattern) {
    const [u, v] = PIP_POSITIONS[i]!;
    const p = toXY(u, v);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draws a vertical stack of `count` dice, centered horizontally at `cx`.
 * Bottom of the stack sits at `by`. Pips are only shown on the very top die.
 */
export function drawDiceStack(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  count: number,
  color: string,
  size = DIE_SIZE,
  depth = DIE_DEPTH,
) {
  if (count <= 0) return;
  // Ground shadow under the stack.
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
  ctx.beginPath();
  ctx.ellipse(cx + depth * 0.4, by + 2, size * 0.65, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const bx = cx - size / 2;
  const stride = size + DIE_STACK_GAP;
  // Bottom die first, then upwards.
  for (let i = 0; i < count; i++) {
    const dieBy = by - i * stride;
    const isTop = i === count - 1;
    drawDie3D(ctx, bx, dieBy, size, color, isTop ? 1 : 0, 0);
  }
}

/**
 * Draws a horizontal row of dice (used during attack roll animation), each
 * showing the value at the corresponding index of `values`.
 */
export function drawDiceRow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  values: number[],
  color: string,
  size: number,
) {
  if (values.length === 0) return;
  const gap = 3;
  const totalW = values.length * size + (values.length - 1) * gap;
  let x = cx - totalW / 2;
  for (const v of values) {
    drawDie3D(ctx, x, cy + size, size, color, 0, v);
    x += size + gap;
  }
}

export function shade(hex: string, factor: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(parseInt(m[1]!.slice(0, 2), 16) * factor);
  const g = clamp(parseInt(m[1]!.slice(2, 4), 16) * factor);
  const b = clamp(parseInt(m[1]!.slice(4, 6), 16) * factor);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
