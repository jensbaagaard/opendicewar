"use client";

import { useEffect, useState } from "react";
import { Contestant, ROUND_LABELS } from "./bracket";

export interface TournamentBarProps {
  roundIndex: number; // 0=QF, 1=SF, 2=F
  totalRounds: number;
  opponent: Contestant | null;
  rerollsLeft: number;
  maxRerolls: number;
  canReroll: boolean;
  onReroll: () => void;
  onQuit: () => void;
}

export function TournamentBar({
  roundIndex,
  totalRounds,
  opponent,
  rerollsLeft,
  maxRerolls,
  canReroll,
  onReroll,
  onQuit,
}: TournamentBarProps) {
  const [rerollPulse, setRerollPulse] = useState(0);
  const [lastReroll, setLastReroll] = useState(rerollsLeft);
  useEffect(() => {
    if (rerollsLeft < lastReroll) setRerollPulse((k) => k + 1);
    setLastReroll(rerollsLeft);
  }, [rerollsLeft, lastReroll]);

  const roundLabel =
    ROUND_LABELS[roundIndex] ?? `Round ${roundIndex + 1}`;

  return (
    <div className="tour-bar" role="region" aria-label="Tournament progress">
      <div className="tour-bar-row">
        <div className="tour-bar-title">
          <span className="tour-bar-label">{roundLabel.toUpperCase()}</span>
          <span className="tour-bar-count">
            <span className="tour-bar-num">{roundIndex + 1}</span>
            <span className="tour-bar-slash">/</span>
            <span className="tour-bar-total">{totalRounds}</span>
          </span>
        </div>
        <button
          type="button"
          className="btn ghost small tour-quit"
          onClick={onQuit}
          aria-label="Quit tournament"
        >
          Quit
        </button>
      </div>
      {opponent && (
        <div className="tour-opponent" aria-label={`Opponent: ${opponent.name}`}>
          <span className="tour-opp-label">NEXT</span>
          <span
            className="tour-opp-card"
            style={{ ["--c" as string]: opponent.color }}
          >
            <span className="tour-opp-emblem" aria-hidden>
              {opponent.emblem}
            </span>
            <span className="tour-opp-name">{opponent.name}</span>
          </span>
        </div>
      )}
      <div className="tour-bar-row tour-reroll-row">
        <div
          key={rerollPulse}
          className={`tour-rerolls${rerollPulse ? " pulse" : ""}`}
          aria-live="polite"
        >
          <span className="tour-rerolls-label">MAP REROLLS · THIS MATCH</span>
          <span className="tour-rerolls-dots">
            {Array.from({ length: maxRerolls }).map((_, i) => (
              <span
                key={i}
                className={`tour-rerolls-dot${i < rerollsLeft ? " on" : ""}`}
                aria-hidden
              />
            ))}
          </span>
          <span className="tour-rerolls-num">{rerollsLeft}</span>
        </div>
        <button
          type="button"
          className="btn small tour-reroll-btn"
          onClick={onReroll}
          disabled={!canReroll || rerollsLeft <= 0}
          title="Reroll the map layout (same opponents)"
        >
          ↻ Reroll map
        </button>
      </div>
    </div>
  );
}
