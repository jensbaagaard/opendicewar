"use client";

import { useEffect, useMemo, useState } from "react";

export interface ReinforceEvent {
  count: number;
  color: string;
  key: number;
}

const HOLD_MS = 1500;

export function ReinforceFx({ event }: { event: ReinforceEvent | null }) {
  const [visible, setVisible] = useState<ReinforceEvent | null>(null);
  useEffect(() => {
    if (!event) {
      setVisible(null);
      return;
    }
    setVisible(event);
    const t = setTimeout(() => setVisible(null), HOLD_MS);
    return () => clearTimeout(t);
  }, [event]);

  const dice = useMemo(() => {
    if (!visible) return [];
    const n = Math.min(visible.count, 10);
    const out: Array<{ angle: number; distance: number; delay: number }> = [];
    for (let i = 0; i < n; i++) {
      out.push({
        angle: (360 / n) * i - 90 + (Math.random() - 0.5) * 14,
        distance: 60 + Math.random() * 40,
        delay: i * 30,
      });
    }
    return out;
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      key={visible.key}
      className="rf-overlay"
      style={{ ["--rf-color" as string]: visible.color }}
      aria-live="polite"
    >
      <div className="rf-glow" />
      <div className="rf-dice">
        {dice.map((d, i) => (
          <span
            key={i}
            className="rf-die"
            style={{
              ["--rf-angle" as string]: `${d.angle}deg`,
              ["--rf-dist" as string]: `${d.distance}px`,
              animationDelay: `${d.delay}ms`,
            }}
          >
            <span className="rf-pip" />
            <span className="rf-pip" />
            <span className="rf-pip" />
          </span>
        ))}
      </div>
      <div className="rf-text">
        <span className="rf-plus">+{visible.count}</span>
        <span className="rf-label">DICE!</span>
      </div>
    </div>
  );
}
