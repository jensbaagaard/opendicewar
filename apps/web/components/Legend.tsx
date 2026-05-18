"use client";

import { useEffect, useState } from "react";
import { GameState, largestConnectedSize } from "@opendicewar/core";
import { BlendWeights } from "@opendicewar/ai";

export interface LegendProps {
  state: GameState;
  /** Per-player blend weights. `null` for human players. */
  weights: Array<BlendWeights | null>;
  humanId: number;
}

const COLLAPSE_KEY = "dicewars.legend.collapsed";

export function Legend({ state, weights, humanId }: LegendProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  };

  const aliveCount = state.players.filter((p) => p.alive).length;

  return (
    <aside className={`legend ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="legend-title"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="legend-list"
      >
        <span className="legend-chevron" aria-hidden>
          {collapsed ? "▸" : "▾"}
        </span>
        <span>Opponents</span>
        {collapsed && (
          <span className="legend-count" aria-hidden>
            {aliveCount}
          </span>
        )}
      </button>
      {!collapsed && (
      <ul id="legend-list" className="legend-list">
        {state.players.map((p) => {
          const territories = state.territories.filter((t) => t.owner === p.id);
          const totalDice = territories.reduce((s, t) => s + t.dice, 0);
          const income = p.alive ? largestConnectedSize(state, p.id) : 0;
          const w = weights[p.id];
          const isCurrent = p.id === state.currentPlayer && state.phase !== "ended";
          const isHuman = p.id === humanId;
          return (
            <li
              key={p.id}
              className={`legend-row ${p.alive ? "" : "dead"} ${isCurrent ? "current" : ""}`}
            >
              <div className="legend-head">
                <span className="swatch" style={{ background: p.color }} />
                <strong>{isHuman ? "You" : `Player ${p.id}`}</strong>
                {!p.alive && <span className="badge">out</span>}
              </div>
              {w && (
                <div
                  className="legend-icons"
                  aria-label={`heuristic ${w.heuristic}, aggressive ${w.aggressive}${w.political ? `, political ${w.political}` : ""}`}
                >
                  <IconRow
                    kind="pawn"
                    count={bucket(w.heuristic)}
                    title={`Heuristic: ${Math.round(w.heuristic * 100)}`}
                  />
                  <IconRow
                    kind="sword"
                    count={bucket(w.aggressive)}
                    title={`Aggressive: ${Math.round(w.aggressive * 100)}`}
                  />
                  {w.political !== undefined && w.political > 0 && (
                    <IconRow
                      kind="crown"
                      count={bucket(w.political)}
                      title={`Political: ${Math.round(w.political * 100)}`}
                    />
                  )}
                </div>
              )}
              <div className="legend-stats">
                <span title="Territories">▢ {territories.length}</span>
                <span title="Total dice">⚀ {totalDice}</span>
                <span title="Next reinforcement">↑ {income}</span>
                {p.stock > 0 && <span title="Stockpile">+{p.stock}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </aside>
  );
}

/** Maps a 0..1 weight into a 1..4 icon count, distributed roughly evenly. */
function bucket(value: number): number {
  return Math.max(1, Math.min(4, Math.round(value * 3) + 1));
}

function IconRow({
  kind,
  count,
  title,
  max = 4,
}: {
  kind: "sword" | "pawn" | "crown";
  count: number;
  title: string;
  max?: number;
}) {
  return (
    <div className="icon-row" title={title}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`legend-icon ${i < count ? "on" : "off"} ${kind}`}
          aria-hidden
        >
          {kind === "sword" ? <SwordIcon /> : kind === "pawn" ? <PawnIcon /> : <CrownIcon />}
        </span>
      ))}
    </div>
  );
}

function SwordIcon() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M8 0.5 L9.6 2.6 L9.6 9 L8 10.6 L6.4 9 L6.4 2.6 Z" />
      <rect x="4.5" y="9.2" width="7" height="1.1" rx="0.4" />
      <rect x="7.4" y="10.3" width="1.2" height="3" rx="0.4" />
      <circle cx="8" cy="14.1" r="0.8" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M2 5.2 L4.6 8 L8 4 L11.4 8 L14 5.2 L13 11.4 H3 Z" />
      <rect x="2.6" y="12" width="10.8" height="1.6" rx="0.4" />
      <circle cx="2" cy="5.2" r="0.9" />
      <circle cx="14" cy="5.2" r="0.9" />
      <circle cx="8" cy="3.4" r="1" />
    </svg>
  );
}

function PawnIcon() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3.4" r="2.2" />
      <path d="M5.8 5.8 H10.2 L9.2 8.4 L11 10.4 L11 11.6 L5 11.6 L5 10.4 L6.8 8.4 Z" />
      <path d="M2.8 12.4 H13.2 L12.2 14.6 H3.8 Z" />
    </svg>
  );
}
