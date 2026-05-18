"use client";

import { useEffect, useMemo, useState } from "react";
import { BracketView } from "./BracketView";
import { BracketState } from "./bracket";
import { makeAsh, makeConfetti, makeRays } from "./endgameFx";

export function TournamentEndOverlay({
  outcome,
  bracket,
  rerollsUsed,
  onRestart,
  onExit,
}: {
  outcome: "champion" | "eliminated";
  bracket: BracketState;
  rerollsUsed: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const isWin = outcome === "champion";
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 380);
    const t2 = setTimeout(() => setStage(2), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const confetti = useMemo(
    () => (isWin ? makeConfetti(110) : makeAsh(50)),
    [isWin],
  );
  const rays = useMemo(() => makeRays(16), []);

  const matchesWon = bracket.rounds
    .flat()
    .filter((m) => m.winner === 0).length;

  return (
    <div
      className={`gend-root tour-end${isWin ? " win" : " loss"}`}
      role="dialog"
      aria-modal="true"
      aria-label={isWin ? "Tournament Champion" : "Tournament Over"}
    >
      <div className="gend-back" />
      {isWin && (
        <div className="gend-rays" aria-hidden>
          {rays.map((r, i) => (
            <span
              key={i}
              className="gend-ray"
              style={{
                transform: `rotate(${r.angle}deg)`,
                animationDelay: `${r.delay}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="gend-confetti" aria-hidden>
        {confetti.map((c, i) => (
          <span
            key={i}
            className={isWin ? "gend-piece" : "gend-piece ash"}
            style={{
              left: `${c.left}%`,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rot}deg)`,
            }}
          />
        ))}
      </div>

      <div className={`gend-card stage-${stage}`}>
        <div className="gend-emoji" aria-hidden>
          {isWin ? "👑" : "💀"}
        </div>
        <h1 className="gend-title">
          {isWin ? "CHAMPION!" : "ELIMINATED"}
        </h1>
        <div className="gend-sub">
          {isWin ? (
            <>You took the crown!</>
          ) : (
            <>Fell in the {roundName(bracket.currentRound)}.</>
          )}
        </div>
        <div className="tour-end-bracket">
          <BracketView bracket={bracket} compact />
        </div>
        <div className="tour-stats">
          <div className="tour-stat">
            <span className="tour-stat-num">{matchesWon}</span>
            <span className="tour-stat-label">battles won</span>
          </div>
          <div className="tour-stat">
            <span className="tour-stat-num">{rerollsUsed}</span>
            <span className="tour-stat-label">rerolls used (total)</span>
          </div>
        </div>
        {stage >= 2 && (
          <div className="gend-actions">
            <button type="button" className="btn gend-primary" onClick={onRestart}>
              {isWin ? "Play again" : "Try again"}
            </button>
            <button type="button" className="btn ghost" onClick={onExit}>
              Exit tournament
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function roundName(idx: number): string {
  if (idx === 0) return "quarterfinal";
  if (idx === 1) return "semifinal";
  return "final";
}

