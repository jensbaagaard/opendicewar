# opendicewar

A modern, open-source reimplementation of Taro Ito's [Dicewars](https://www.gamedesign.jp/games/dicewars/) — a turn-based area-control strategy game on a procedurally generated hex map. Each territory holds a stack of dice; you attack adjacent enemy territories by rolling against them; last player standing wins.

This project is **not affiliated** with gamedesign.jp; it is an independent, MIT-licensed homage. All credit for the original game design goes to Taro Ito.

## Features

- **Hotseat play** against up to 6 AI opponents on a procedurally generated 32-territory hex map.
- **Tournament mode** — an 8-player single-elimination bracket with per-match map rerolls.
- **History scrubber** — step through any past move with ← / → / Home / End, or drag the slider.
- **Multiple AI personalities** — bots are weighted blends of a heuristic (expected-value) signal, an aggressive (dice-advantage) signal, and an optional political (leader-targeting) signal. Each match's lineup is derived deterministically from the game seed.
- **Naval attacks** (optional) — coastal territories can attack across one hex of open water. Enable with `?naval=1`.
- **Underdog bonus** — when more than two players are alive, a substantially weaker player's dice roll with advantage (roll twice, keep higher).
- **Deterministic by seed** — every match can be replayed exactly via `?seed=N`. The same seed always produces the same map, opponent personalities, and dice rolls.
- **Mobile-friendly** — the board canvas scales and stays touch-interactive on narrow viewports.

## Quick start

Requires Node 20+ and [pnpm](https://pnpm.io/) 9+.

```bash
pnpm install
pnpm dev               # apps/web on http://localhost:3000
pnpm test              # unit tests (vitest) across all packages
pnpm test:e2e          # Playwright end-to-end tests
pnpm --filter @opendicewar/cli start   # headless AI-vs-AI match
```

URL parameters (on `/play`):
- `?seed=N` — pin the map + dice + AI personalities to a specific seed.
- `?mode=tournament` — start an 8-player bracket.
- `?naval=1` — enable coastal attacks across one water hex.
- `?fast=1` — bots act with zero think delay (used by E2E tests).

## Monorepo layout

```
apps/
  web/    Next.js 15 app (deploys to Vercel)
  cli/    Headless tournament / benchmarking runner
packages/
  core/   Rules engine, RNG, map generation (zero deps)
  ai/     Bots and the expected-value (win-probability) table
e2e/      Playwright specs
```

The packages are wired together via [Turborepo](https://turbo.build/) + pnpm workspaces.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                        UI                              │
│  (Next.js, canvas board, attack animation, splashes)   │
└─────────────────────────────┬──────────────────────────┘
                              │  observes state, emits actions
┌─────────────────────────────▼──────────────────────────┐
│                  packages/core (rules)                 │
│  applyAttack, applyEndTurn, legalAttacks, isUnderdog,  │
│  newGame, seeded RNG, map generation                   │
└─────────────────────────────┬──────────────────────────┘
                              │  no I/O, no globals
┌─────────────────────────────▼──────────────────────────┐
│                   packages/ai (bots)                   │
│  Agent { chooseAction(state) → Action }                │
│  RandomBot · GreedyBot · HeuristicBot · PoliticalBot   │
│  makeBlendedBot({ heuristic, aggressive, political })  │
└────────────────────────────────────────────────────────┘
```

- **Rules core** is pure functions on immutable state. Every state mutation goes through `applyAttack` or `applyEndTurn`, both of which return a new state and append a structured action to `state.history`. The RNG state is part of the game state, so replays from the same seed are byte-identical.
- **AI agents** implement a one-method interface (`chooseAction(state) → AgentAction`). `makeBlendedBot` returns a parameterized bot; the web app generates 6 opponents per match by seeding a separate PRNG with the match seed.
- **Web app** subscribes to state, drives the bot turns, and overlays UI on a canvas-rendered board. The same `drawDie3D` routine is used for the dice stacks on the board and for the small dice icons in the player bar — they're guaranteed to look identical.

## Game rules summary

- **Turn**: the active player attacks any number of times, then ends turn.
- **Attack**: source must have ≥2 dice and be adjacent to an enemy. Both sides roll all their dice; higher total wins, ties go to the defender. Win → all but one die move to the captured territory. Loss → source drops to 1 die.
- **Reinforcement**: on end-of-turn, the player gets new dice equal to the size of their largest connected component of territories. Dice are placed randomly on owned territories (cap 16 per territory); overflow goes to a stockpile (cap 64).
- **Elimination**: a player is out when they own zero territories. Last alive wins.

The full design notes live in [DESIGN.md](../DESIGN.md).

## Development

```bash
pnpm typecheck         # tsc --noEmit across all packages
pnpm --filter @opendicewar/core test   # unit tests for rules + reinforce
pnpm lint              # Next.js lint on the web app
```

E2E tests drive the live game via a `__dicewar` window hook that exposes the current state and a programmatic `endTurn()` so Playwright doesn't have to mouse-click. See [e2e/reinforce.spec.ts](./e2e/reinforce.spec.ts).

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import the repo on Vercel.
3. Set **Root Directory** to `apps/web`.
4. Override **Install Command**: `pnpm install --frozen-lockfile` (run from repo root).
5. Override **Build Command**: `cd ../.. && pnpm turbo run build --filter=@opendicewar/web...`.
6. Output directory: `.next` (default).

## License

MIT. See [LICENSE](./LICENSE).
