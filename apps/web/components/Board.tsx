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
import { DIE_SIZE, drawDiceRow, drawDiceStack } from "./dice";

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

const SHAKE_MS = 380;
const REVEAL_MS = 600;
export const TOTAL_ANIMATION_MS = SHAKE_MS + REVEAL_MS;

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
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
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
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;
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
  // Leave room above for tall dice towers.
  minY -= 70;
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

  const shaking = elapsed < SHAKE_MS;
  const atkValues = shaking
    ? anim.atkRolls.map(() => 1 + Math.floor(Math.random() * 6))
    : anim.atkRolls;
  const defValues = shaking
    ? anim.defRolls.map(() => 1 + Math.floor(Math.random() * 6))
    : anim.defRolls;

  // Small "jitter" while shaking — offset the row position randomly.
  const jx = shaking ? (Math.random() - 0.5) * 4 : 0;
  const jy = shaking ? (Math.random() - 0.5) * 3 : 0;

  drawDiceRow(ctx, fromCentroid.x + jx, fromCentroid.y - 36 + jy, atkValues, anim.fromColor, 14);
  drawDiceRow(ctx, toCentroid.x + jx, toCentroid.y - 36 + jy, defValues, anim.toColor, 14);

  if (!shaking) {
    const atkSum = sum(atkValues);
    const defSum = sum(defValues);
    drawSum(ctx, fromCentroid.x, fromCentroid.y - 56, atkSum, anim.fromColor, anim.result === "win");
    drawSum(ctx, toCentroid.x, toCentroid.y - 56, defSum, anim.toColor, anim.result === "loss");
  }
}

function drawSum(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  total: number,
  color: string,
  winner: boolean,
) {
  ctx.save();
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = String(total);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = winner ? "#222" : color;
  ctx.fillText(text, cx, cy);
  if (winner) {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffb300";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
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
