"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  GameState,
  HexCell,
  Territory,
  TerritoryId,
  axialKey,
  hexCorners,
  hexToPixel,
} from "@opendicewar/core";
import { DIE_SIZE, drawDie3DCentered, drawDiceStack } from "./dice";

export interface RollAnimation {
  from: TerritoryId;
  to: TerritoryId;
  fromColor: string;
  toColor: string;
  fromDiceBefore: number;
  toDiceBefore: number;
  atkRolls: number[];
  defRolls: number[];
  result: "win" | "loss";
}

export interface BoardProps {
  state: GameState;
  selected: TerritoryId | null;
  legalTargets: Set<TerritoryId>;
  onTerritoryClick: (id: TerritoryId) => void;
  onTerritoryHover?: (id: TerritoryId | null) => void;
  width?: number;
  height?: number;
  animation?: RollAnimation | null;
  onAnimationComplete?: () => void;
}

const HEX_SIZE = 16;
const PADDING = 28;

// Attack animation phases. Times are cumulative thresholds within
// TOTAL_ANIMATION_MS — keep them in ascending order.
const PHASE_WINDUP_END = 90;     // anticipatory pull-back / wind-up
const PHASE_TUMBLE_END = 460;    // dice tumble in the air, faces churning
const PHASE_SETTLE_END = 820;    // dice cascade down and bounce-land
const PHASE_REVEAL_END = 1280;   // totals count up, winner pulses
export const TOTAL_ANIMATION_MS = PHASE_REVEAL_END;
const DIE_ANIM_SIZE = 16;
const ROW_LIFT = 38;             // baseline px above territory centroid

export function Board(props: BoardProps) {
  const { state, selected, legalTargets, onTerritoryClick, onTerritoryHover, animation, onAnimationComplete } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const completeRef = useRef(onAnimationComplete);
  completeRef.current = onAnimationComplete;

  const { bounds, cellPositions, territoryCentroids, cellsByTerritory } = useMemo(
    () => layout(state.cells, state.territories),
    [state.cells, state.territories],
  );

  const width = props.width ?? Math.ceil(bounds.width + PADDING * 2);
  const height = props.height ?? Math.ceil(bounds.height + PADDING * 2);
  const offsetX = PADDING - bounds.minX;
  const offsetY = PADDING - bounds.minY;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    // CSS scales to fit container width; aspect ratio keeps it from stretching.
    canvas.style.maxWidth = `${width}px`;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${width} / ${height}`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const drawArgs: DrawCtx = {
      state,
      selected,
      legalTargets,
      cellPositions,
      territoryCentroids,
      cellsByTerritory,
      offsetX,
      offsetY,
    };

    if (!animation) {
      draw(ctx, drawArgs, null);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      draw(ctx, drawArgs, { anim: animation, elapsed });
      if (elapsed >= TOTAL_ANIMATION_MS) {
        completeRef.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, selected, legalTargets, cellPositions, territoryCentroids, cellsByTerritory, offsetX, offsetY, width, height, animation]);

  const onMouse = (
    e: React.MouseEvent<HTMLCanvasElement>,
    cb: (tid: TerritoryId | null) => void,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Canvas may be CSS-scaled (e.g. on narrow mobile screens). Convert client
    // coords back into the layout coordinate system used by `pick`.
    const sx = rect.width === 0 ? 1 : width / rect.width;
    const sy = rect.height === 0 ? 1 : height / rect.height;
    const x = (e.clientX - rect.left) * sx - offsetX;
    const y = (e.clientY - rect.top) * sy - offsetY;
    const hit = pick(x, y, cellPositions, state.cells);
    cb(hit);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", cursor: animation ? "default" : "pointer", background: "#fff", borderRadius: 8 }}
      onClick={(e) => onMouse(e, (tid) => tid !== null && onTerritoryClick(tid))}
      onMouseMove={(e) => onMouse(e, (tid) => onTerritoryHover?.(tid))}
      onMouseLeave={() => onTerritoryHover?.(null)}
    />
  );
}

interface LayoutResult {
  bounds: { minX: number; minY: number; width: number; height: number };
  cellPositions: Map<number, { x: number; y: number }>;
  territoryCentroids: Map<TerritoryId, { x: number; y: number }>;
  cellsByTerritory: Map<TerritoryId, HexCell[]>;
}

function layout(cells: HexCell[], territories: Territory[]): LayoutResult {
  const cellPositions = new Map<number, { x: number; y: number }>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    const p = hexToPixel(c.q, c.r, HEX_SIZE);
    cellPositions.set(c.id, p);
    if (p.x - HEX_SIZE < minX) minX = p.x - HEX_SIZE;
    if (p.y - HEX_SIZE < minY) minY = p.y - HEX_SIZE;
    if (p.x + HEX_SIZE > maxX) maxX = p.x + HEX_SIZE;
    if (p.y + HEX_SIZE > maxY) maxY = p.y + HEX_SIZE;
  }
  // Leave room below the bottom row for the dice tower / counter.
  maxY += 70;
  const cellsByTerritory = new Map<TerritoryId, HexCell[]>();
  for (const c of cells) {
    if (!cellsByTerritory.has(c.territory)) cellsByTerritory.set(c.territory, []);
    cellsByTerritory.get(c.territory)!.push(c);
  }
  const territoryCentroids = new Map<TerritoryId, { x: number; y: number }>();
  for (const t of territories) {
    let sx = 0, sy = 0;
    for (const cid of t.cells) {
      const p = cellPositions.get(cid)!;
      sx += p.x; sy += p.y;
    }
    territoryCentroids.set(t.id, { x: sx / t.cells.length, y: sy / t.cells.length });
  }
  return {
    bounds: { minX, minY, width: maxX - minX, height: maxY - minY },
    cellPositions,
    territoryCentroids,
    cellsByTerritory,
  };
}

interface DrawCtx {
  state: GameState;
  selected: TerritoryId | null;
  legalTargets: Set<TerritoryId>;
  cellPositions: Map<number, { x: number; y: number }>;
  territoryCentroids: Map<TerritoryId, { x: number; y: number }>;
  cellsByTerritory: Map<TerritoryId, HexCell[]>;
  offsetX: number;
  offsetY: number;
}

interface AnimationFrame {
  anim: RollAnimation;
  elapsed: number;
}

function draw(ctx: CanvasRenderingContext2D, c: DrawCtx, animFrame: AnimationFrame | null) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(c.offsetX, c.offsetY);

  const cellByCoord = new Map<string, HexCell>();
  for (const cell of c.state.cells) cellByCoord.set(axialKey(cell.q, cell.r), cell);

  // Pass 1: fill hexes by owner color.
  for (const cell of c.state.cells) {
    const pos = c.cellPositions.get(cell.id)!;
    const territory = c.state.territories[cell.territory]!;
    const owner = c.state.players[territory.owner]!;
    drawHex(ctx, pos.x, pos.y, HEX_SIZE, owner.color, "rgba(0,0,0,0.08)", 1);
  }

  // Pass 2: thick black outlines on inter-territory edges only.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1a1a1a";
  const dirs = [
    { q: +1, r: 0 },
    { q: +1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: +1 },
    { q: 0, r: +1 },
  ];
  const edgeMap = [0, 5, 4, 3, 2, 1];
  for (const cell of c.state.cells) {
    const pos = c.cellPositions.get(cell.id)!;
    const corners = hexCorners(pos.x, pos.y, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      const d = dirs[i]!;
      const neighborKey = axialKey(cell.q + d.q, cell.r + d.r);
      const neighbor = cellByCoord.get(neighborKey);
      if (neighbor && neighbor.territory === cell.territory) continue;
      if (neighbor && neighbor.id < cell.id) continue;
      const startIdx = edgeMap[i]!;
      const a = corners[startIdx]!;
      const b = corners[(startIdx + 1) % 6]!;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Pass 3: highlights (selected / legal targets).
  if (c.selected !== null) {
    drawTerritoryOutline(ctx, c, c.selected, "#ffb300", 4);
  }
  for (const tid of c.legalTargets) {
    drawTerritoryOutline(ctx, c, tid, "rgba(220, 25, 25, 0.95)", 3);
  }

  // Pass 4: dice towers — skip the from/to territories while animating.
  const skip = new Set<TerritoryId>();
  if (animFrame) {
    skip.add(animFrame.anim.from);
    skip.add(animFrame.anim.to);
  }
  for (const t of c.state.territories) {
    if (skip.has(t.id)) continue;
    const centroid = c.territoryCentroids.get(t.id)!;
    const owner = c.state.players[t.owner]!;
    drawDiceStack(ctx, centroid.x, centroid.y + DIE_SIZE / 2, t.dice, owner.color);
  }

  // Pass 5: animation overlay.
  if (animFrame) drawAnimation(ctx, c, animFrame);

  ctx.restore();
}

function drawAnimation(ctx: CanvasRenderingContext2D, c: DrawCtx, frame: AnimationFrame) {
  const { anim, elapsed } = frame;
  const fromCentroid = c.territoryCentroids.get(anim.from)!;
  const toCentroid = c.territoryCentroids.get(anim.to)!;

  // Per-roll seed so the "random" tumble path is consistent across redraws
  // for the same animation. Mixed in: which die, which side, the roll values.
  const seedBase = (anim.from * 92821 + anim.to * 31337) >>> 0;

  drawSide(
    ctx,
    elapsed,
    fromCentroid.x,
    fromCentroid.y,
    anim.atkRolls,
    anim.fromColor,
    /* attacker */ true,
    anim.result === "win",
    seedBase,
  );
  drawSide(
    ctx,
    elapsed,
    toCentroid.x,
    toCentroid.y,
    anim.defRolls,
    anim.toColor,
    /* attacker */ false,
    anim.result === "loss",
    seedBase ^ 0xc0ffee,
  );
}

/**
 * Renders one side (attacker or defender) of the roll animation. Walks all
 * phases — windup → tumble → settle → reveal — driving per-die transforms.
 */
function drawSide(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  cx: number,
  cy: number,
  rolls: number[],
  color: string,
  isAttacker: boolean,
  isWinner: boolean,
  seed: number,
) {
  const n = rolls.length;
  if (n === 0) return;

  const size = DIE_ANIM_SIZE;
  const gap = 4;
  const totalW = n * size + (n - 1) * gap;
  const rowY = cy - ROW_LIFT;
  const leftX = cx - totalW / 2 + size / 2;

  // Cascading settle: each die finishes its tumble at slightly different times
  // so they land in sequence (left → right) instead of in unison.
  const settleStaggerPerDie = Math.min(80, (PHASE_SETTLE_END - PHASE_TUMBLE_END) / Math.max(1, n));

  // Final-value display state for the reveal phase.
  const inReveal = elapsed >= PHASE_SETTLE_END;
  const revealT = clamp01(
    (elapsed - PHASE_SETTLE_END) / (PHASE_REVEAL_END - PHASE_SETTLE_END),
  );

  // Single ground shadow under the row, fading in during settle.
  const shadowAlpha =
    elapsed < PHASE_TUMBLE_END
      ? 0.05
      : 0.05 + 0.18 * clamp01((elapsed - PHASE_TUMBLE_END) / 300);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, rowY + size * 0.55, totalW / 2 + 4, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < n; i++) {
    const baseX = leftX + i * (size + gap);
    const baseY = rowY;
    const dieSeed = (seed ^ (i * 0x9e3779b1)) >>> 0;
    const rng = mulberry32(dieSeed);

    // Per-die settle threshold — left dice settle first.
    const dieTumbleEnd = PHASE_TUMBLE_END + i * settleStaggerPerDie * 0.4;
    const dieSettleEnd = PHASE_SETTLE_END + i * settleStaggerPerDie * 0;

    // Compute transform per phase.
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let scaleX = 1;
    let scaleY = 1;
    let value = rolls[i]!;
    let dustAlpha = 0;

    // Per-die tumble character (chaotic by design — real dice never roll the
    // same way twice). All seeded from the die's mulberry32, so the path is
    // stable across redraws for the same animation.
    const spinDir = rng() < 0.5 ? -1 : 1;
    const spinSpeed = (1.6 + rng() * 1.4) * spinDir; // turns per second
    const reverseAt = 0.35 + rng() * 0.35; // fraction of tumble where spin can reverse
    const reverses = rng() < 0.55;
    const flickerSeed = (dieSeed ^ 0xa7f0) >>> 0;
    // Horizontal jitter base + frequency (small — dice are roughly at row pos).
    const jx0 = rng() * Math.PI * 2;
    const jy0 = rng() * Math.PI * 2;

    if (elapsed < PHASE_WINDUP_END) {
      // Wind-up: die scales up from the territory below its row spot.
      const t = elapsed / PHASE_WINDUP_END;
      const e = easeOutCubic(t);
      scaleX = 0.35 + 0.65 * e;
      scaleY = scaleX;
      dy = 18 * (1 - e); // rises from below the row up to its hover spot
      rot = (rng() - 0.5) * 0.4 * e;
      value = randomFace(mulberry32((flickerSeed ^ Math.floor(elapsed / 60)) >>> 0));
    } else if (elapsed < dieTumbleEnd) {
      // Tumble. The eye reads "rolling dice" as:
      //   (a) rapid changes of face value,
      //   (b) continuous rotation in a not-quite-periodic way,
      //   (c) loose 2D jitter — but no rhythmic bouncing.
      const t =
        (elapsed - PHASE_WINDUP_END) / (dieTumbleEnd - PHASE_WINDUP_END);
      // Hover slightly above the row, drifting a hair (no bell-curve bobbing).
      dx = Math.sin(elapsed * 0.011 + jx0) * 3.2;
      dy = -8 + Math.sin(elapsed * 0.017 + jy0) * 2.4;

      // Rotation: accumulating with an optional mid-tumble reverse for chaos.
      const tumbleMs = elapsed - PHASE_WINDUP_END;
      let rotated = (tumbleMs / 1000) * spinSpeed * Math.PI * 2;
      if (reverses && t > reverseAt) {
        const overshoot = (t - reverseAt) * (dieTumbleEnd - PHASE_WINDUP_END) / 1000;
        // Subtract twice the post-reverse spin so the angle actually goes back.
        rotated -= overshoot * spinSpeed * Math.PI * 2 * 2;
      }
      rot = rotated;

      // Faces flicker at a tempo matched to the spin so it reads as rolling
      // rather than slideshowing. ~12–18 changes per second.
      const flickerHz = 14 + (1 - t) * 6; // slows slightly as tumble winds down
      const tick = Math.floor((tumbleMs / 1000) * flickerHz);
      value = randomFace(mulberry32((flickerSeed ^ tick) >>> 0));
      // Tiny scale breathing — keeps the die feeling animated, not pasted.
      scaleY = 1 + Math.sin(elapsed * 0.018 + jx0) * 0.04;
      scaleX = 1 + Math.cos(elapsed * 0.018 + jy0) * 0.04;
    } else if (elapsed < dieSettleEnd) {
      // Settle. Single smooth landing — no bouncing. Rotation snaps to its
      // nearest natural orientation, dice descend from hover to row baseline,
      // and the final face locks in. A brief squash marks the touchdown.
      const t = clamp01(
        (elapsed - dieTumbleEnd) / (dieSettleEnd - dieTumbleEnd),
      );
      const e = easeOutCubic(t);
      // Hover position at start of settle continues from tumble's drift.
      const hoverDx = Math.sin(dieTumbleEnd * 0.011 + jx0) * 3.2;
      const hoverDy = -8 + Math.sin(dieTumbleEnd * 0.017 + jy0) * 2.4;
      dx = hoverDx * (1 - e);
      dy = hoverDy * (1 - e); // descends to dy=0 (baseline)

      // Final spin freeze: rotation eases to 0.
      const tumbleMs = dieTumbleEnd - PHASE_WINDUP_END;
      let endRot = (tumbleMs / 1000) * spinSpeed * Math.PI * 2;
      if (reverses) {
        endRot -=
          ((dieTumbleEnd - PHASE_WINDUP_END) / 1000 - reverseAt * (dieTumbleEnd - PHASE_WINDUP_END) / 1000) *
            spinSpeed *
            Math.PI *
            2 *
            2;
      }
      rot = endRot * (1 - e);

      // Touchdown squash: peaks right when the die meets the row.
      const touch = Math.max(0, t - 0.75) / 0.25;
      const squash = Math.sin(touch * Math.PI);
      scaleY = 1 - 0.18 * squash;
      scaleX = 1 + 0.12 * squash;

      value = rolls[i]!;
      // Single dust kick on touchdown.
      if (touch > 0.05 && touch < 0.65) dustAlpha = (1 - touch) * 0.55;
    } else {
      // At rest. Subtle drift so the dice don't look frozen, but no pulsing.
      const t = (elapsed - dieSettleEnd) * 0.003;
      scaleY = 1 + Math.sin(t + i * 0.7) * 0.01;
      scaleX = 1 + Math.cos(t + i * 0.7) * 0.01;
      rot = 0;
      value = rolls[i]!;
    }

    // Dust particles under the die on landing — small expanding circles.
    if (dustAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = `rgba(140,140,140,${(dustAlpha * 0.55).toFixed(3)})`;
      for (let k = 0; k < 4; k++) {
        const px = baseX + (k - 1.5) * 3 + (rng() - 0.5) * 2;
        const py = baseY + size * 0.55 - dustAlpha * 1.5;
        const pr = 1.4 + dustAlpha * 2.4;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawDie3DCentered(
      ctx,
      baseX + dx,
      baseY + dy,
      size,
      color,
      0,
      value,
      rot,
      scaleX,
      scaleY,
    );
  }

  // Reveal: count-up total, with a glowing ring on the winner.
  if (inReveal) {
    const finalTotal = sum(rolls);
    const countUpT = easeOutCubic(clamp01(revealT * 2.5));
    const displayed = Math.round(finalTotal * countUpT);
    drawSum(
      ctx,
      cx,
      rowY - size * 1.7,
      displayed,
      color,
      isWinner,
      elapsed - PHASE_SETTLE_END,
    );
  }
}

function drawSum(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  total: number,
  color: string,
  winner: boolean,
  msSinceReveal: number,
) {
  ctx.save();
  // Pulsing glow ring on the winner.
  if (winner) {
    const t = (msSinceReveal % 900) / 900;
    const pulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 2);
    const ringR = 16 + pulse * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 179, 0, ${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Soft halo.
    const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, ringR + 6);
    halo.addColorStop(0, "rgba(255, 213, 79, 0.35)");
    halo.addColorStop(1, "rgba(255, 213, 79, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR + 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = `bold ${winner ? 18 : 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = String(total);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = winner ? "#1a1a1a" : color;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}
function randomFace(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}
/** Tiny deterministic PRNG so per-die tumble paths are stable across redraws. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  const pts = hexCorners(cx, cy, size);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawTerritoryOutline(
  ctx: CanvasRenderingContext2D,
  c: DrawCtx,
  tid: TerritoryId,
  color: string,
  width: number,
) {
  const cells = c.cellsByTerritory.get(tid);
  if (!cells) return;
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  const cellByCoord = new Map<string, HexCell>();
  for (const cell of c.state.cells) cellByCoord.set(axialKey(cell.q, cell.r), cell);
  const dirs = [
    { q: +1, r: 0 },
    { q: +1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: +1 },
    { q: 0, r: +1 },
  ];
  const edgeMap = [0, 5, 4, 3, 2, 1];
  for (const cell of cells) {
    const pos = c.cellPositions.get(cell.id)!;
    const corners = hexCorners(pos.x, pos.y, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      const d = dirs[i]!;
      const neighborKey = axialKey(cell.q + d.q, cell.r + d.r);
      const neighbor = cellByCoord.get(neighborKey);
      if (neighbor && neighbor.territory === cell.territory) continue;
      const startIdx = edgeMap[i]!;
      const a = corners[startIdx]!;
      const b = corners[(startIdx + 1) % 6]!;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function pick(
  x: number,
  y: number,
  cellPositions: Map<number, { x: number; y: number }>,
  cells: HexCell[],
): TerritoryId | null {
  let best: { cell: HexCell; d: number } | null = null;
  for (const c of cells) {
    const p = cellPositions.get(c.id)!;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.hypot(dx, dy);
    if (d < HEX_SIZE && (best === null || d < best.d)) best = { cell: c, d };
  }
  return best ? best.cell.territory : null;
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
