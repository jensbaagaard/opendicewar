"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MenuDemo } from "../components/MenuDemo";

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) >>> 0;
}

export default function Home() {
  const [seed, setSeed] = useState<number>(1);
  const [mounted, setMounted] = useState<boolean>(false);

  // Random seed picked client-side so SSR/CSR don't mismatch.
  useEffect(() => {
    setSeed(randomSeed());
    setMounted(true);
  }, []);

  const playHref = `/play?seed=${seed}`;
  const tournamentHref = `/play?mode=tournament`;

  return (
    <main className="menu-shell">
      <div className="menu-bg" aria-hidden>
        {mounted && <MenuDemo />}
      </div>
      <div className="menu-bg-veil" aria-hidden />

      <section className="menu-card">
        <h1 className="menu-title">
          <span className="menu-title-line">OPEN</span>
          <span className="menu-title-line accent">DICEWAR</span>
        </h1>
        <p className="menu-tagline">hex · dice · domination</p>

        <div className="menu-cta">
          <Link href={playHref} className="btn menu-btn primary">
            PLAY
          </Link>
          <Link href={tournamentHref} className="btn menu-btn">
            TOURNAMENT
          </Link>
        </div>

        <div className="menu-settings">
          <label className="menu-seed">
            <span>seed</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="seed-input"
              value={String(seed)}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n) && n >= 0) setSeed((n >>> 0) || 1);
              }}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Game seed"
            />
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setSeed(randomSeed())}
              aria-label="Roll a new seed"
              title="Roll a new seed"
            >
              🎲
            </button>
          </label>
        </div>

        <p className="menu-credit">
          After Taro Ito&apos;s{" "}
          <a
            href="https://www.gamedesign.jp/games/dicewars/"
            target="_blank"
            rel="noreferrer"
          >
            Dicewars
          </a>
          . Open source · MIT.
        </p>
      </section>
    </main>
  );
}
