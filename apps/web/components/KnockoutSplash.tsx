"use client";

import { useEffect, useMemo, useState } from "react";

export interface KnockoutEvent {
  id: number;
  playerId: number;
  color: string;
  isHuman: boolean;
}

const SPLASH_MS = 1600;

const FLAVOR_BOT = [
  "CRUSHED!",
  "WIPED OUT!",
  "DESTROYED!",
  "SMASHED!",
  "ANNIHILATED!",
  "OBLITERATED!",
];

export function KnockoutSplash({
  queue,
  paused,
  onConsume,
}: {
  queue: KnockoutEvent[];
  paused: boolean;
  onConsume: (id: number) => void;
}) {
  const active = paused ? null : queue[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => onConsume(active.id), SPLASH_MS);
    return () => clearTimeout(t);
  }, [active, onConsume]);

  if (!active) return null;
  return <Splash key={active.id} event={active} />;
}

function Splash({ event }: { event: KnockoutEvent }) {
  const word = useMemo(
    () =>
      event.isHuman ? "YOU'RE OUT!" : FLAVOR_BOT[event.id % FLAVOR_BOT.length]!,
    [event.id, event.isHuman],
  );
  const shards = useMemo(() => makeShards(18, event.color), [event.id, event.color]);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExiting(true), SPLASH_MS - 280);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`ko-splash${exiting ? " out" : ""}${event.isHuman ? " human" : ""}`}
      role="status"
      aria-live="assertive"
      style={{ ["--ko-color" as string]: event.color }}
    >
      <div className="ko-flash" />
      <div className="ko-burst">
        {shards.map((s, i) => (
          <span
            key={i}
            className="ko-shard"
            style={{
              background: s.color,
              ["--ko-angle" as string]: `${s.angle}deg`,
              ["--ko-dist" as string]: `${s.distance}px`,
              animationDelay: `${s.delay}ms`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              borderRadius: s.round ? "50%" : "2px",
            }}
          />
        ))}
      </div>
      <div className="ko-stack-center">
        <div className="ko-crown" aria-hidden>
          <span className="ko-die" style={{ background: event.color }}>
            <span className="ko-die-pip" />
          </span>
        </div>
        <h2 className="ko-word">
          <span>PLAYER</span>
          <span className="ko-num">{event.playerId}</span>
        </h2>
        <h1 className="ko-bang">{word}</h1>
      </div>
    </div>
  );
}

function makeShards(n: number, color: string) {
  const palette = [color, "#fff", "#ffd54f", "#ff5252"];
  const out: Array<{
    angle: number;
    distance: number;
    color: string;
    delay: number;
    size: number;
    round: boolean;
  }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      angle: (360 / n) * i + (Math.random() - 0.5) * 12,
      distance: 140 + Math.random() * 160,
      color: palette[i % palette.length]!,
      delay: Math.floor(Math.random() * 80),
      size: 10 + Math.random() * 10,
      round: i % 2 === 0,
    });
  }
  return out;
}
