"use client";

import { useEffect, useState } from "react";
import {
  GameState,
  applyAttack,
  applyEndTurn,
  newGame,
} from "@opendicewar/core";
import { HeuristicBot, RandomBot, Agent } from "@opendicewar/ai";
import { Board } from "./Board";

const TICK_MS = 220;
const PLAYERS = 7;

function randomSeed(): number {
  return (Math.random() * 0x7fffffff) >>> 0;
}

function makeGame(seed: number): GameState {
  return newGame({
    seed,
    playerCount: PLAYERS,
    territoryCount: 32,
    gridWidth: 32,
    gridHeight: 32,
    cellsPerTerritory: 24,
  });
}

// Alternating bots keep the demo varied without dragging in the political
// weights machinery — random keeps it lively, heuristic keeps it sensible.
function pickAgent(playerId: number): Agent {
  return playerId % 2 === 0 ? HeuristicBot : RandomBot;
}

export function MenuDemo() {
  const [game, setGame] = useState<GameState>(() => makeGame(randomSeed()));

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      if (cancelled) return;
      setGame((prev) => {
        if (prev.phase === "ended") return makeGame(randomSeed());
        const agent = pickAgent(prev.currentPlayer);
        const action = agent.chooseAction(prev);
        try {
          if (action.kind === "endTurn") return applyEndTurn(prev);
          return applyAttack(prev, action.from, action.to);
        } catch {
          // Bot picked an illegal move (shouldn't happen, but be defensive).
          return applyEndTurn(prev);
        }
      });
    }, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Board
      state={game}
      selected={null}
      legalTargets={new Set()}
      onTerritoryClick={() => {}}
      animation={null}
    />
  );
}
