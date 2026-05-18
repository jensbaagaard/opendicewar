"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 1100;

export function TurnBanner({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), HOLD_MS);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!show) return null;
  return (
    <div key={trigger} className="turn-banner" aria-live="polite">
      <div className="turn-stripe" />
      <span className="turn-arrow">▸</span>
      <span className="turn-text">YOUR TURN</span>
      <span className="turn-arrow">▸</span>
    </div>
  );
}
