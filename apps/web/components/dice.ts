/**
 * Canvas-drawn d6 in isometric perspective: front face + visible top face + visible right face.
 * Pips drawn in the standard die layout. Body is tinted by the owner's color.
 */

export const DIE_SIZE = 16; // front face edge length in px
export const DIE_DEPTH = 6; // isometric offset
export const DIE_STACK_GAP = 2; // visible gap between stacked dice
export const DICE_PER_STACK = 8; // dice cap before overflow into a side stack
export const DIE_COLUMN_GAP = 2; // horizontal gap between side-by-side stacks

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
  const fy = by - h; // front face top y

  const front = color;
  const right = shade(color, 0.7);
  const top = shade(color, 1.18);

  ctx.lineJoin = "miter";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#111";

  // Right face (parallelogram).
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(bx + w, by);
  ctx.lineTo(bx + w + d, by - d);
  ctx.lineTo(bx + w + d, fy - d);
  ctx.lineTo(bx + w, fy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Top face (parallelogram).
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(bx, fy);
  ctx.lineTo(bx + d, fy - d);
  ctx.lineTo(bx + w + d, fy - d);
  ctx.lineTo(bx + w, fy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front face.
  ctx.fillStyle = front;
  ctx.fillRect(bx, fy, w, h);
  ctx.strokeRect(bx, fy, w, h);

  // Specular highlight along the top-front edge for a glossy feel.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.6, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(bx + size * 0.12, fy + ctx.lineWidth);
  ctx.lineTo(bx + w - size * 0.12, fy + ctx.lineWidth);
  ctx.stroke();
  ctx.restore();

  // Pips on top face — rendered onto a slightly skewed parallelogram.
  if (topValue > 0) drawPipsOnTop(ctx, bx, fy, w, d, topValue);
  if (frontValue > 0) drawPipsOnFront(ctx, bx, fy, w, h, frontValue);
}

function drawPip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // Drop shadow (offset down-right) — gives the pip a recessed-into-face look.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(cx + r * 0.18, cy + r * 0.22, r, 0, Math.PI * 2);
  ctx.fill();

  // White pip body with a soft radial highlight toward upper-left.
  const grad = ctx.createRadialGradient(
    cx - r * 0.35,
    cy - r * 0.35,
    r * 0.1,
    cx,
    cy,
    r,
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.7, "#f0f0f0");
  grad.addColorStop(1, "#cfcfcf");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
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
  const r = Math.max(1.4, w * 0.095);
  for (const i of pattern) {
    const [px, py] = PIP_POSITIONS[i]!;
    drawPip(ctx, x + px * w, y + py * h, r);
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
  const r = Math.max(1.3, w * 0.09);
  // Map (u, v) in [0,1]^2 on the top face to canvas xy.
  // Top corners: P00=(fx,fy), P10=(fx+w,fy), P01=(fx+d, fy-d), P11=(fx+w+d, fy-d)
  const toXY = (u: number, v: number) => ({
    x: fx + u * w + v * d,
    y: fy - v * d,
  });
  for (const i of pattern) {
    const [u, v] = PIP_POSITIONS[i]!;
    const p = toXY(u, v);
    drawPip(ctx, p.x, p.y, r);
  }
}

/**
 * Draws `count` dice as side-by-side stacks, each holding at most
 * DICE_PER_STACK dice. Stacks are centered horizontally at `cx`; the bottom
 * sits at `by`. Pips are only shown on the top die of each stack.
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

  const columns: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const take = Math.min(remaining, DICE_PER_STACK);
    columns.push(take);
    remaining -= take;
  }

  const totalWidth = columns.length * size + (columns.length - 1) * DIE_COLUMN_GAP;
  const leftBx = cx - totalWidth / 2;

  // Ground shadow spanning all columns — two stacked ellipses fake a soft falloff.
  ctx.save();
  const shadowCx = leftBx + totalWidth / 2 + depth * 0.25 + 2;
  const shadowCy = by + 4 - 5;
  const shadowRx = totalWidth / 2 + size * 0.22;
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.beginPath();
  ctx.ellipse(shadowCx, shadowCy, shadowRx, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.beginPath();
  ctx.ellipse(shadowCx, shadowCy, shadowRx * 0.66, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const stride = size + DIE_STACK_GAP;
  // Left column first so the right column overlaps in front in the iso projection.
  let bx = leftBx;
  for (const colCount of columns) {
    for (let i = 0; i < colCount; i++) {
      const dieBy = by - i * stride;
      const isTop = i === colCount - 1;
      drawDie3D(ctx, bx, dieBy, size, color, isTop ? 1 : 0, 0);
    }
    bx += size + DIE_COLUMN_GAP;
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

/**
 * Draws a die centered at (cx, cy) with the given rotation (rad) and uniform
 * scale. Used by the attack animation so each die can spin and bounce
 * independently of the row layout.
 */
export function drawDie3DCentered(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  topValue: number,
  frontValue: number,
  rot: number,
  scaleX: number,
  scaleY: number = scaleX,
  alpha: number = 1,
) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (rot !== 0) ctx.rotate(rot);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  // drawDie3D takes the front-face bottom-left; offset so the die centers on origin.
  drawDie3D(ctx, -size / 2, size / 2, size, color, topValue, frontValue);
  ctx.restore();
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
