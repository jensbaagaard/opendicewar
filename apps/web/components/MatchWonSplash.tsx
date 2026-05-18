"use client";

import { useEffect, useMemo, useState } from "react";
import { makeShards } from "./splashFx";

export interface MatchWonEvent {
  id: number;
  roundLabel: string;
  beatenOpponentName: string;
  beatenOpponentEmblem: string;
  beatenOpponentColor: string;
  nextRoundLabel: string | null;
  nextOpponentName: string | null;
  nextOpponentEmblem: string | null;
  nextOpponentColor: string | null;
  color: string;
}

const SPLASH_MS = 2400;

const FLAVOR = [
  "ADVANCING!",
  "VICTORY!",
  "CRUSHED 'EM!",
  "DOMINATED!",
  "FLAWLESS!",
  "MOVING ON!",
];

export function MatchWonSplash({
  event,
  paused,
  onConsume,
}: {
  event: MatchWonEvent | null;
  paused: boolean;
  onConsume: (id: number) => void;
}) {
  const active = paused ? null : event;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => onConsume(active.id), SPLASH_MS);
    return () => clearTimeout(t);
  }, [active, onConsume]);

  if (!active) return null;
  return <Splash key={active.id} event={active} />;
}

function Splash({ event }: { event: MatchWonEvent }) {
  const word = useMemo(
    () => FLAVOR[event.id % FLAVOR.length]!,
    [event.id],
  );
  const shards = useMemo(
    () =>
      makeShards(22, event.color, {
        accentColor: "#ffe082",
        distanceBase: 160,
        distanceJitter: 200,
        delayMax: 100,
        sizeJitter: 12,
      }),
    [event.id, event.color],
  );
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExiting(true), SPLASH_MS - 360);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`mw-splash${exiting ? " out" : ""}`}
      role="status"
      aria-live="assertive"
      style={{ ["--mw-color" as string]: event.color }}
    >
      <div className="mw-flash" />
      <div className="mw-burst">
        {shards.map((s, i) => (
          <span
            key={i}
            className="mw-shard"
            style={{
              background: s.color,
              ["--mw-angle" as string]: `${s.angle}deg`,
              ["--mw-dist" as string]: `${s.distance}px`,
              animationDelay: `${s.delay}ms`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              borderRadius: s.round ? "50%" : "2px",
            }}
          />
        ))}
      </div>
      <div className="mw-stack-center">
        <div className="mw-trophy" aria-hidden>🏆</div>
        <h2 className="mw-sub">
          <span>{event.roundLabel.toUpperCase()}</span>
        </h2>
        <h1 className="mw-bang">{word}</h1>
        <div
          className="mw-beat"
          style={{ ["--c" as string]: event.beatenOpponentColor }}
        >
          <span className="mw-beat-emblem" aria-hidden>
            {event.beatenOpponentEmblem}
          </span>
          <span className="mw-beat-text">
            <s>{event.beatenOpponentName}</s> defeated
          </span>
        </div>
        {event.nextOpponentName && (
          <div
            className="mw-next-card"
            style={{ ["--c" as string]: event.nextOpponentColor ?? "#fff" }}
          >
            <span className="mw-next-label">
              {event.nextRoundLabel}: NEXT UP
            </span>
            <span className="mw-next-name">
              <span className="mw-next-emblem" aria-hidden>
                {event.nextOpponentEmblem}
              </span>
              {event.nextOpponentName}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

