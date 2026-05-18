"use client";

import { GameState, isUnderdog, largestConnectedSize } from "@opendicewar/core";
import { isSubstantialTarget } from "@opendicewar/ai";

export function PlayerBar({ state }: { state: GameState }) {
  return (
    <div
      className="player-bar"
      style={{
        position: "absolute",
        bottom: 8,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 12,
        padding: "6px 10px",
        flexWrap: "wrap",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {state.players.map((p) => {
        const income = p.alive ? largestConnectedSize(state, p.id) : 0;
        const isCurrent = p.id === state.currentPlayer && state.phase !== "ended";
        const leader = p.alive && isSubstantialTarget(state, p.id);
        const underdog = p.alive && isUnderdog(state, p.id);
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: p.alive ? 1 : 0.35,
              padding: "4px 10px",
              borderRadius: 6,
              background: isCurrent ? "rgba(255, 179, 0, 0.92)" : "rgba(255, 255, 255, 0.85)",
              outline: isCurrent ? "2px solid #ffb300" : "1px solid rgba(0, 0, 0, 0.12)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18)",
              backdropFilter: "blur(2px)",
            }}
          >
            <DieMarker color={p.color} leader={leader} underdog={underdog} />
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{income}</strong>
            {p.stock > 0 && (
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>+{p.stock}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DieMarker({
  color,
  leader,
  underdog,
}: {
  color: string;
  leader: boolean;
  underdog: boolean;
}) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 28,
      }}
      title={leader ? "Leader" : underdog ? "Underdog" : undefined}
    >
      {underdog && <Wings />}
      <DieIcon color={color} />
      {leader && <MiniCrown />}
    </span>
  );
}

function MiniCrown() {
  return (
    <svg
      width="16"
      height="11"
      viewBox="0 0 16 11"
      style={{
        position: "absolute",
        top: -6,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
      }}
      aria-hidden
    >
      <path
        d="M1 9 L2.4 2.2 L5 6.4 L8 1 L11 6.4 L13.6 2.2 L15 9 Z"
        fill="#f4c724"
        stroke="#7a5b00"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <rect x="1.4" y="8.4" width="13.2" height="1.4" rx="0.4" fill="#d9a900" stroke="#7a5b00" strokeWidth="0.6" />
      <circle cx="2.4" cy="2.2" r="0.9" fill="#fff3a8" stroke="#7a5b00" strokeWidth="0.5" />
      <circle cx="8" cy="1" r="0.9" fill="#fff3a8" stroke="#7a5b00" strokeWidth="0.5" />
      <circle cx="13.6" cy="2.2" r="0.9" fill="#fff3a8" stroke="#7a5b00" strokeWidth="0.5" />
    </svg>
  );
}

function Wings() {
  return (
    <svg
      width="36"
      height="20"
      viewBox="0 0 36 20"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
      }}
      aria-hidden
    >
      <path
        d="M14 10 C 10 5, 4 5, 1 10 C 4 11, 6 12, 8 13 C 5 14, 4 16, 4 18 C 9 15, 12 14, 14 12 Z"
        fill="#fdf3c4"
        stroke="#b08d3a"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <path
        d="M22 10 C 26 5, 32 5, 35 10 C 32 11, 30 12, 28 13 C 31 14, 32 16, 32 18 C 27 15, 24 14, 22 12 Z"
        fill="#fdf3c4"
        stroke="#b08d3a"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DieIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="4" width="16" height="14" rx="2" fill={color} stroke="#222" strokeWidth="1.2" />
      <polygon points="2,4 5,1 21,1 18,4" fill={shade(color, 0.7)} stroke="#222" strokeWidth="1.2" />
      <polygon points="18,4 21,1 21,15 18,18" fill={shade(color, 0.55)} stroke="#222" strokeWidth="1.2" />
      <circle cx="10" cy="11" r="1.8" fill="#222" />
    </svg>
  );
}

function shade(hex: string, factor: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = Math.round(parseInt(m[1]!.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(m[1]!.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(m[1]!.slice(4, 6), 16) * factor);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
