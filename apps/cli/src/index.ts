#!/usr/bin/env node
import { applyAttack, applyEndTurn, newGame } from "@opendicewar/core";
import { GreedyBot, RandomBot, type Agent } from "@opendicewar/ai";

const SEED = Number(process.env.SEED ?? Date.now());
const PLAYER_COUNT = 4;
const TERRITORY_COUNT = 16;

const agents: Agent[] = [RandomBot, GreedyBot, RandomBot, GreedyBot];

let state = newGame({ seed: SEED, playerCount: PLAYER_COUNT, territoryCount: TERRITORY_COUNT });

let steps = 0;
const MAX_STEPS = 5_000;

while (state.phase !== "ended" && steps < MAX_STEPS) {
  const agent = agents[state.currentPlayer]!;
  const action = agent.chooseAction(state);
  if (action.kind === "endTurn") {
    state = applyEndTurn(state);
  } else {
    state = applyAttack(state, action.from, action.to);
  }
  steps += 1;
}

const winner = state.players.find((p) => p.alive);
console.log(`seed=${SEED} steps=${steps} winner=${winner?.id ?? "none"}`);
console.log(
  state.players
    .map((p) => `  P${p.id} ${p.alive ? "alive" : "out"} (${agents[p.id]?.name}) territories=${state.territories.filter((t) => t.owner === p.id).length}`)
    .join("\n"),
);
