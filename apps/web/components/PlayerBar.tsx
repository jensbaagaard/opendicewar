"use client";

import { GameState, largestConnectedSize } from "@opendicewar/core";

export function PlayerBar({ state }: { state: GameState }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 18,
        padding: "12px 0",
        flexWrap: "wrap",
      }}
    >
      {state.players.map((p) => {
        const income = p.alive ? largestConnectedSize(state, p.id) : 0;
        const isCurrent = p.id === state.currentPlayer && state.phase !== "ended";
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: p.alive ? 1 : 0.3,
              padding: "4px 10px",
              borderRadius: 6,
              background: isCurrent ? "rgba(255, 179, 0, 0.18)" : "transparent",
              outline: isCurrent ? "2px solid #ffb300" : "none",
            }}
          >
            <DieIcon color={p.color} />
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
