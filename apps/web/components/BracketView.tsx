"use client";

import {
  BracketMatch,
  BracketState,
  HUMAN_CONTESTANT_ID,
  ROUND_LABELS_SHORT,
} from "./bracket";

export function BracketView({
  bracket,
  compact = false,
}: {
  bracket: BracketState;
  compact?: boolean;
}) {
  return (
    <div className={`bracket${compact ? " compact" : ""}`} aria-label="Tournament bracket">
      {bracket.rounds.map((round, ri) => (
        <div key={ri} className="bracket-col">
          <div className="bracket-col-label">{ROUND_LABELS_SHORT[ri]}</div>
          <div className="bracket-col-matches">
            {round.map((m) => (
              <MatchCard
                key={m.slot}
                match={m}
                bracket={bracket}
                isCurrent={
                  ri === bracket.currentRound &&
                  (m.a === HUMAN_CONTESTANT_ID || m.b === HUMAN_CONTESTANT_ID) &&
                  m.winner === null &&
                  bracket.outcome === "playing"
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  bracket,
  isCurrent,
}: {
  match: BracketMatch;
  bracket: BracketState;
  isCurrent: boolean;
}) {
  const decided = match.winner !== null;
  return (
    <div
      className={`bracket-match${isCurrent ? " current" : ""}${
        decided ? " decided" : ""
      }`}
    >
      <Slot
        contestantId={match.a}
        winner={match.winner}
        bracket={bracket}
      />
      <div className="bracket-vs">vs</div>
      <Slot
        contestantId={match.b}
        winner={match.winner}
        bracket={bracket}
      />
    </div>
  );
}

function Slot({
  contestantId,
  winner,
  bracket,
}: {
  contestantId: number | null;
  winner: number | null;
  bracket: BracketState;
}) {
  if (contestantId === null) {
    return (
      <div className="bracket-slot tbd">
        <span className="bracket-slot-emblem" aria-hidden>?</span>
        <span className="bracket-slot-name">TBD</span>
      </div>
    );
  }
  const c = bracket.contestants[contestantId];
  if (!c) return null;
  const isWinner = winner === contestantId;
  const isLoser = winner !== null && !isWinner;
  const isHuman = contestantId === HUMAN_CONTESTANT_ID;
  return (
    <div
      className={`bracket-slot${isWinner ? " winner" : ""}${
        isLoser ? " loser" : ""
      }${isHuman ? " human" : ""}`}
      style={{ ["--c" as string]: c.color }}
    >
      <span className="bracket-slot-emblem" aria-hidden>
        {c.emblem}
      </span>
      <span className="bracket-slot-name">{c.name}</span>
      {isWinner && <span className="bracket-slot-check" aria-hidden>✓</span>}
    </div>
  );
}
