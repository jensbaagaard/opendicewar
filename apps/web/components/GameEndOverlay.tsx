"use client";

import { useEffect, useMemo, useState } from "react";

export function GameEndOverlay({
  winnerColor,
  winnerId,
  isHumanWin,
  onNewGame,
  onDismiss,
}: {
  winnerColor: string;
  winnerId: number;
  isHumanWin: boolean;
  onNewGame: () => void;
  onDismiss: () => void;
}) {
  // Staged reveal: bang → buttons.
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
    () => (isHumanWin ? makeConfetti(90) : makeAsh(40)),
    [isHumanWin],
  );
  const rays = useMemo(() => makeRays(14), []);

  return (
    <div
      className={`gend-root${isHumanWin ? " win" : " loss"}`}
      role="dialog"
      aria-modal="true"
      aria-label={isHumanWin ? "Victory" : "Game over"}
      style={{ ["--gend-color" as string]: winnerColor }}
    >
      <div className="gend-back" />
      {isHumanWin && (
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
            className={isHumanWin ? "gend-piece" : "gend-piece ash"}
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
          {isHumanWin ? "👑" : "💀"}
        </div>
        <h1 className="gend-title">
          {isHumanWin ? "VICTORY!" : "GAME OVER"}
        </h1>
        <div className="gend-sub">
          {isHumanWin ? (
            <>You conquered the map!</>
          ) : (
            <>
              <span className="gend-swatch" style={{ background: winnerColor }} aria-hidden />
              <span>Player {winnerId} took the crown.</span>
            </>
          )}
        </div>
        {stage >= 2 && (
          <div className="gend-actions">
            <button type="button" className="btn gend-primary" onClick={onNewGame}>
              Play again
            </button>
            <button type="button" className="btn ghost" onClick={onDismiss}>
              View board
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const WIN_COLORS = [
  "#ffd54f",
  "#ff5252",
  "#42a5f5",
  "#66bb6a",
  "#ab47bc",
  "#ffa726",
  "#26c6da",
  "#ffffff",
];
const ASH_COLORS = ["#666", "#444", "#888", "#3a3a3a"];

interface Piece {
  left: number;
  color: string;
  delay: number;
  duration: number;
  rot: number;
}

function makeConfetti(n: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: Math.random() * 100,
      color: WIN_COLORS[i % WIN_COLORS.length]!,
      delay: Math.random() * 1.8,
      duration: 2.4 + Math.random() * 2.2,
      rot: Math.random() * 360,
    });
  }
  return out;
}

function makeAsh(n: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: Math.random() * 100,
      color: ASH_COLORS[i % ASH_COLORS.length]!,
      delay: Math.random() * 3,
      duration: 5 + Math.random() * 3,
      rot: Math.random() * 360,
    });
  }
  return out;
}

function makeRays(n: number) {
  const out: Array<{ angle: number; delay: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ angle: (360 / n) * i, delay: (i % 3) * 0.08 });
  }
  return out;
}
