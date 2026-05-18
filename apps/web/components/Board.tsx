"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GameState,
  HEX_DIRS,
  HexCell,
  Territory,
  TerritoryId,
  axialKey,
  hexCorners,
  hexToPixel,
} from "@opendicewar/core";
import { DIE_SIZE, drawDiceStack } from "./dice";
import { D3D_TOTAL_MS, Dice3DOverlay } from "./Dice3DOverlay";
import { WaterLayer } from "./WaterLayer";

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

/** Maps HEX_DIRS[i] to the corresponding starting corner index for the edge
 *  shared with that neighbor. Pointy-top hexes, corners as returned by
 *  hexCorners(). */
const EDGE_START_CORNER = [0, 5, 4, 3, 2, 1];

/**
 * Total time the attack animation occupies. The dice themselves animate in
 * the DOM via {@link Dice3DOverlay}; this constant is exposed so callers
 * (e.g. the bot driver) can gate input until the overlay finishes.
 */
export const TOTAL_ANIMATION_MS = D3D_TOTAL_MS;

export function Board(props: BoardProps) {
  const { state, selected, legalTargets, onTerritoryClick, onTerritoryHover, animation, onAnimationComplete } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const completeRef = useRef(onAnimationComplete);
  completeRef.current = onAnimationComplete;
  const [cssScale, setCssScale] = useState(1);

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

    draw(ctx, {
      state,
      selected,
      legalTargets,
      cellPositions,
      territoryCentroids,
      cellsByTerritory,
      offsetX,
      offsetY,
      animatingFrom: animation?.from ?? null,
      animatingTo: animation?.to ?? null,
    });
  }, [state, selected, legalTargets, cellPositions, territoryCentroids, cellsByTerritory, offsetX, offsetY, width, height, animation]);

  // Animation completion is now driven by the 3D overlay's known duration.
  // We schedule a single timer rather than spinning a RAF loop on the canvas.
  useEffect(() => {
    if (!animation) return;
    const t = setTimeout(() => completeRef.current?.(), TOTAL_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [animation]);

  // Track wrapper width so the 3D overlay scales with the canvas on mobile.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setCssScale(w / width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const fromCentroid = animation ? territoryCentroids.get(animation.from) : null;
  const toCentroid = animation ? territoryCentroids.get(animation.to) : null;
  // Stable id per attack so the overlay clusters remount and rerun their roll.
  const animKeyRef = useRef(0);
  const lastAnimRef = useRef<RollAnimation | null>(null);
  if (animation !== lastAnimRef.current) {
    if (animation) animKeyRef.current++;
    lastAnimRef.current = animation ?? null;
  }

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
    <div
      ref={wrapRef}
      className="board-canvas-wrap"
      style={{
        position: "relative",
        display: "inline-block",
        width: "100%",
        maxWidth: `${width}px`,
        aspectRatio: `${width} / ${height}`,
        overflow: "hidden",
        borderRadius: 8,
      }}
    >
      <WaterLayer />
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          cursor: animation ? "default" : "pointer",
          background: "transparent",
          borderRadius: 8,
          position: "relative",
          zIndex: 1,
        }}
        onClick={(e) => onMouse(e, (tid) => tid !== null && onTerritoryClick(tid))}
        onMouseMove={(e) => onMouse(e, (tid) => onTerritoryHover?.(tid))}
        onMouseLeave={() => onTerritoryHover?.(null)}
      />
      {animation && fromCentroid && toCentroid && (
        <Dice3DOverlay
          fromX={fromCentroid.x + offsetX}
          fromY={fromCentroid.y + offsetY}
          toX={toCentroid.x + offsetX}
          toY={toCentroid.y + offsetY}
          canvasWidth={width}
          canvasHeight={height}
          scale={cssScale}
          atkRolls={animation.atkRolls}
          defRolls={animation.defRolls}
          fromColor={animation.fromColor}
          toColor={animation.toColor}
          result={animation.result}
          animKey={animKeyRef.current}
        />
      )}
    </div>
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
  /** Territories whose dice towers are skipped because the 3D overlay covers them. */
  animatingFrom: TerritoryId | null;
  animatingTo: TerritoryId | null;
}

function draw(ctx: CanvasRenderingContext2D, c: DrawCtx) {
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
  for (const cell of c.state.cells) {
    const pos = c.cellPositions.get(cell.id)!;
    const corners = hexCorners(pos.x, pos.y, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      const d = HEX_DIRS[i]!;
      const neighborKey = axialKey(cell.q + d.q, cell.r + d.r);
      const neighbor = cellByCoord.get(neighborKey);
      if (neighbor && neighbor.territory === cell.territory) continue;
      if (neighbor && neighbor.id < cell.id) continue;
      const startIdx = EDGE_START_CORNER[i]!;
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

  // Pass 4: dice towers — skip the from/to territories while animating, since
  // the 3D HTML overlay covers them.
  for (const t of c.state.territories) {
    if (t.id === c.animatingFrom || t.id === c.animatingTo) continue;
    const centroid = c.territoryCentroids.get(t.id)!;
    const owner = c.state.players[t.owner]!;
    drawDiceStack(ctx, centroid.x, centroid.y + DIE_SIZE / 2, t.dice, owner.color);
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
  for (const cell of cells) {
    const pos = c.cellPositions.get(cell.id)!;
    const corners = hexCorners(pos.x, pos.y, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      const d = HEX_DIRS[i]!;
      const neighborKey = axialKey(cell.q + d.q, cell.r + d.r);
      const neighbor = cellByCoord.get(neighborKey);
      if (neighbor && neighbor.territory === cell.territory) continue;
      const startIdx = EDGE_START_CORNER[i]!;
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
