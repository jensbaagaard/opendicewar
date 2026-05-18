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
          . Open source · MIT.{" "}
          <a
            className="menu-credit-gh"
            href="https://github.com/jensbaagaard/opendicewar"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <GitHubMark />
          </a>
        </p>
      </section>
    </main>
  );
}

function GitHubMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
