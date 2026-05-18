"use client";

import { Action } from "@opendicewar/core";

export interface HistoryBarProps {
  totalSteps: number;
  currentStep: number;
  isLive: boolean;
  actions: Action[];
  onSeek: (step: number) => void;
  onBackToLive: () => void;
}

function describeStep(action: Action | undefined): string {
  if (!action) return "Initial state";
  if (action.kind === "attack") {
    const result = action.result === "win" ? "won" : "lost";
    return `P${action.player} attacks T${action.from} → T${action.to}: ${result}`;
  }
  if (action.kind === "endTurn") return `P${action.player} ended turn`;
  return "";
}

export function HistoryBar({
  totalSteps,
  currentStep,
  isLive,
  actions,
  onSeek,
  onBackToLive,
}: HistoryBarProps) {
  const action = currentStep > 0 ? actions[currentStep - 1] : undefined;
  const atStart = currentStep === 0;
  const atEnd = currentStep >= totalSteps;
  return (
    <div className="history-bar">
      <button
        className="btn ghost small first"
        onClick={() => onSeek(0)}
        disabled={atStart}
        aria-label="First step"
      >
        ⏮
      </button>
      <button
        className="btn ghost small prev"
        onClick={() => onSeek(currentStep - 1)}
        disabled={atStart}
        aria-label="Previous step"
      >
        ◀
      </button>
      <input
        className="history-slider"
        type="range"
        min={0}
        max={Math.max(totalSteps, 1)}
        value={currentStep}
        disabled={totalSteps === 0}
        onChange={(e) => onSeek(Number(e.currentTarget.value))}
      />
      <button
        className="btn ghost small next"
        onClick={() => onSeek(currentStep + 1)}
        disabled={atEnd}
        aria-label="Next step"
      >
        ▶
      </button>
      <button
        className="btn ghost small last"
        onClick={() => onSeek(totalSteps)}
        disabled={atEnd}
        aria-label="Last step"
      >
        ⏭
      </button>
      <button
        className="btn ghost small live"
        onClick={onBackToLive}
        disabled={isLive}
        aria-label="Back to live"
      >
        Live
      </button>
      <span className="history-label">
        {describeStep(action)} · {currentStep}/{totalSteps}
      </span>
    </div>
  );
}
