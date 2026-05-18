#!/usr/bin/env node
/**
 * Round-robin tournament harness. Runs every bot in every seat across a set of
 * seeds and reports per-bot win counts. Used to validate AI changes.
 *
 *   pnpm --filter @opendicewar/cli exec tsx src/tournament.ts \
 *     [--seeds=50] [--players=4] [--territories=24] [--max-steps=8000]
 *
 * Bots are configured below in BOTS. Each game seats `players` bots picked
 * round-robin from BOTS so every bot plays an equal number of slots across
 * the run. Seats also rotate per seed so position bias washes out.
 */
import { applyAttack, applyEndTurn, newGame } from "@opendicewar/core";
import {
  BeamBot,
  DefensiveBot,
  GreedyBot,
  HeuristicBot,
  MCTSBot,
  OpportunistBot,
  PoliticalBot,
  RandomBot,
  SplitterBot,
  type Agent,
} from "@opendicewar/ai";

interface Args {
  seeds: number;
  players: number;
  territories: number;
  maxSteps: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seeds: 50, players: 4, territories: 24, maxSteps: 8000 };
  for (const raw of argv) {
    const [k, v] = raw.replace(/^--/, "").split("=");
    if (k === "seeds") args.seeds = Number(v);
    else if (k === "players") args.players = Number(v);
    else if (k === "territories") args.territories = Number(v);
    else if (k === "max-steps") args.maxSteps = Number(v);
  }
  return args;
}

const BOTS: Agent[] = [
  RandomBot,
  GreedyBot,
  HeuristicBot,
  PoliticalBot,
  DefensiveBot,
  SplitterBot,
  OpportunistBot,
  BeamBot,
  MCTSBot,
];

function playGame(
  seed: number,
  seats: Agent[],
  territoryCount: number,
  maxSteps: number,
): { winnerSeat: number | null; steps: number } {
  let state = newGame({
    seed,
    playerCount: seats.length,
    territoryCount,
  });
  let steps = 0;
  while (state.phase !== "ended" && steps < maxSteps) {
    const agent = seats[state.currentPlayer]!;
    const action = agent.chooseAction(state);
    if (action.kind === "endTurn") state = applyEndTurn(state);
    else state = applyAttack(state, action.from, action.to);
    steps++;
  }
  const winner = state.players.find((p) => p.alive);
  return { winnerSeat: winner?.id ?? null, steps };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const { seeds, players, territories, maxSteps } = args;

  const wins = new Map<string, number>();
  const games = new Map<string, number>();
  for (const b of BOTS) {
    wins.set(b.name, 0);
    games.set(b.name, 0);
  }

  const start = Date.now();
  let played = 0;
  let drawn = 0;

  for (let s = 0; s < seeds; s++) {
    // Rotate the bot lineup so each bot occupies every seat over the run.
    const seats: Agent[] = [];
    for (let i = 0; i < players; i++) {
      seats.push(BOTS[(s + i) % BOTS.length]!);
    }
    const { winnerSeat } = playGame(s + 1, seats, territories, maxSteps);
    for (const seat of seats) games.set(seat.name, (games.get(seat.name) ?? 0) + 1);
    if (winnerSeat !== null) {
      const name = seats[winnerSeat]!.name;
      wins.set(name, (wins.get(name) ?? 0) + 1);
    } else {
      drawn++;
    }
    played++;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const rows = BOTS
    .map((b) => {
      const w = wins.get(b.name) ?? 0;
      const g = games.get(b.name) ?? 0;
      const rate = g > 0 ? (w / g) * 100 : 0;
      return { name: b.name, w, g, rate };
    })
    .sort((a, b) => b.rate - a.rate);

  console.log(
    `tournament: seeds=${seeds} players=${players} territories=${territories} elapsed=${elapsed}s drawn=${drawn}`,
  );
  console.log("bot              wins  games  winrate");
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(16)} ${String(r.w).padStart(4)} ${String(r.g).padStart(6)}  ${r.rate.toFixed(1)}%`,
    );
  }
  console.log(`played=${played}`);
}

main();
