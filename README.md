# opendicewar

Open-source reimplementation of Taro Ito's *Dicewars* — a turn-based area-control strategy game on a procedurally generated hex map. This project is **not affiliated** with [gamedesign.jp](https://www.gamedesign.jp/games/dicewars/); it is an independent, MIT-licensed homage. All credit for the original game design goes to Taro Ito.

See [DESIGN.md](../DESIGN.md) for the full design.

## Monorepo layout

```
apps/
  web/    Next.js 15 app (deploys to Vercel)
  cli/    Headless tournament runner
packages/
  core/   Rules engine, RNG, map generation (zero deps)
  ai/     Bots (Random, Greedy, Heuristic, MCTS)
  ui/     Shared React components
  config/ Shared lint / tsconfig presets
```

## Quick start

```bash
pnpm install
pnpm dev               # runs apps/web on http://localhost:3000
pnpm test              # vitest on all packages
pnpm --filter @opendicewar/cli start    # run headless AI match
```

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import the repo on Vercel.
3. Set **Root Directory** to `apps/web`.
4. Override **Install Command**: `pnpm install --frozen-lockfile` (run from repo root).
5. Override **Build Command**: `cd ../.. && pnpm turbo run build --filter=@opendicewar/web...`.
6. Output directory: `.next` (default).

## License

MIT. See [LICENSE](./LICENSE).
