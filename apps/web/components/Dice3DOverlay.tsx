"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DIE_PX = 28;
// Throw arc + tumble share this window; the parent container's keyframe
// covers the same duration so dice land at rest exactly when settle begins.
const ROLL_MS = 380;
const SETTLE_PER_DIE_MS = 40;
const SETTLE_TRANSITION_MS = 160;
const HOLD_MS = 60;
const TUMBLE_KEYFRAME_MS = 800;

export interface Dice3DOverlayProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Canvas internal (CSS-pixel) dimensions; the overlay positions in % of these. */
  canvasWidth: number;
  canvasHeight: number;
  /** CSS-scale relative to the canvas's internal dimensions. */
  scale?: number;
  atkRolls: number[];
  defRolls: number[];
  fromColor: string;
  toColor: string;
  result: "win" | "loss";
  /** Stable per-attack id so child state resets on a new animation. */
  animKey: number;
}

/**
 * Total visible duration of the 3D dice roll. Worth keeping in sync with the
 * Board's animation gating so the next attack doesn't begin before this ends.
 */
export function totalDuration(diceMax: number): number {
  return (
    ROLL_MS +
    Math.max(1, diceMax) * SETTLE_PER_DIE_MS +
    SETTLE_TRANSITION_MS +
    HOLD_MS
  );
}

export function Dice3DOverlay(props: Dice3DOverlayProps) {
  const {
    fromX, fromY, toX, toY,
    canvasWidth, canvasHeight, scale = 1,
    atkRolls, defRolls, fromColor, toColor, result, animKey,
  } = props;

  return (
    <div
      className="d3d-overlay"
      aria-hidden
      style={{ ["--d3d-scale" as string]: scale } as React.CSSProperties}
    >
      <Cluster
        key={`atk-${animKey}`}
        cx={fromX}
        cy={fromY - DIE_PX * 1.8}
        canvasW={canvasWidth}
        canvasH={canvasHeight}
        values={atkRolls}
        color={fromColor}
        winner={result === "win"}
      />
      <Cluster
        key={`def-${animKey}`}
        cx={toX}
        cy={toY - DIE_PX * 1.8}
        canvasW={canvasWidth}
        canvasH={canvasHeight}
        values={defRolls}
        color={toColor}
        winner={result === "loss"}
      />
    </div>
  );
}

function Cluster({
  cx, cy, canvasW, canvasH, values, color, winner,
}: {
  cx: number; cy: number; canvasW: number; canvasH: number;
  values: number[]; color: string; winner: boolean;
}) {
  // Show the total the moment dice arrive at rest position — well before
  // their face-snap transition finishes. No fade/scale; snaps in.
  const [showTotal, setShowTotal] = useState(false);
  useEffect(() => {
    setShowTotal(false);
    const t = setTimeout(() => setShowTotal(true), ROLL_MS);
    return () => clearTimeout(t);
  }, [values]);

  if (values.length === 0) return null;
  const total = values.reduce((s, v) => s + v, 0);

  const left = `${(cx / canvasW) * 100}%`;
  const top = `${(cy / canvasH) * 100}%`;

  return (
    <div className="d3d-cluster" style={{ left, top }}>
      <div className="d3d-row">
        {values.map((v, i) => (
          <Die3D
            key={i}
            value={v}
            color={color}
            settleAtMs={ROLL_MS + i * SETTLE_PER_DIE_MS}
          />
        ))}
      </div>
      <div
        className={`d3d-total${showTotal ? " in" : ""}${winner ? " winner" : ""}`}
      >
        {total}
      </div>
    </div>
  );
}

/**
 * One CSS-3D die. While `settleAtMs` hasn't elapsed it spins on the
 * `d3d-tumble` keyframe; after that we drop the `.rolling` class and apply
 * the inline transform for the rolled face — the CSS transition handles the
 * spring-stop into the final orientation.
 */
function Die3D({
  value, color, settleAtMs,
}: {
  value: number; color: string; settleAtMs: number;
}) {
  const [landed, setLanded] = useState(false);
  // Random rotational entropy so dice don't all spin identically — even on
  // the same animation. (Per-mount; the cluster remounts on a new attack.)
  const seed = useRef(Math.random()).current;

  useEffect(() => {
    const t = setTimeout(() => setLanded(true), settleAtMs);
    return () => clearTimeout(t);
  }, [settleAtMs]);

  const cubeStyle: React.CSSProperties = {
    ["--c" as string]: color,
    ...(landed
      ? { transform: FACE_TRANSFORMS[value]! }
      : { animationDelay: `-${Math.round(seed * TUMBLE_KEYFRAME_MS)}ms` }),
  };

  // The outer .d3d-throw owns the arc (translateY + scale); the inner cube
  // owns the rotation. Splitting them lets the throw end on schedule while
  // the cube either keeps tumbling or transitions to its final face.
  const throwStyle: React.CSSProperties = landed
    ? {}
    : {
        animationDuration: `${ROLL_MS}ms`,
        // Slight per-die delay so dice don't fly in perfect unison.
        animationDelay: `-${Math.round(seed * 80)}ms`,
      };

  return (
    <div className={`d3d-throw${landed ? " landed" : ""}`} style={throwStyle}>
      <div className={`d3d-die${landed ? "" : " rolling"}`} style={cubeStyle}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <Face key={f} faceIdx={f} />
        ))}
      </div>
    </div>
  );
}

const FACE_TRANSFORMS: Record<number, string> = {
  // Resting orientations: each value brings that face toward the viewer.
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(-90deg)",
  3: "rotateY(90deg)",
  4: "rotateY(-90deg)",
  5: "rotateX(90deg)",
  6: "rotateY(180deg)",
};

const PIP_GRID: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ faceIdx }: { faceIdx: number }) {
  const set = new Set(PIP_GRID[faceIdx] ?? []);
  return (
    <div className={`d3d-face d3d-f${faceIdx}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`d3d-pip${set.has(i) ? " on" : ""}`} />
      ))}
    </div>
  );
}

/** Public — Board uses this as TOTAL_ANIMATION_MS when scheduling completion. */
export const D3D_TOTAL_MS = totalDuration(8);
