"use client";

import { GameState, largestConnectedSize } from "@opendicewar/core";
import { BlendWeights } from "@opendicewar/ai";

export interface LegendProps {
  state: GameState;
  /** Per-player blend weights. `null` for human players. */
  weights: Array<BlendWeights | null>;
  humanId: number;
}

export function Legend({ state, weights, humanId }: LegendProps) {
  return (
    <aside className="legend">
      <h3 className="legend-title">Opponents</h3>
      <ul className="legend-list">
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
                <div className="legend-bars">
                  <Bar label="H" value={w.heuristic} color="#444" />
                  <Bar label="A" value={w.aggressive} color="#c0392b" />
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
    </aside>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="bar-value">{pct}</span>
    </div>
  );
}
