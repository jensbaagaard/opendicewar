import {
  GameState,
  legalAttacks,
  TerritoryId,
} from "@opendicewar/core";
import { buildContext, scoreMove, ScorerWeights, ScoredMove } from "./scorer";
import { beamChooseAction } from "./beam";
import { mctsChooseAction } from "./mcts";

export { winProbability } from "./ev";
export { isSubstantialTarget } from "./scorer";

export type AgentAction =
  | { kind: "attack"; from: TerritoryId; to: TerritoryId }
  | { kind: "endTurn" };

export interface Agent {
  name: string;
  chooseAction(state: GameState): AgentAction;
}

export const RandomBot: Agent = {
  name: "Random",
  chooseAction(state) {
    const moves = legalAttacks(state);
    if (moves.length === 0) return { kind: "endTurn" };
    if (Math.random() < 0.3) return { kind: "endTurn" };
    const pick = moves[Math.floor(Math.random() * moves.length)]!;
    return { kind: "attack", from: pick.from, to: pick.to };
  },
};

export const GreedyBot: Agent = {
  name: "Aggressive",
  chooseAction(state) {
    return blendedChooseAction(state, { heuristic: 0, aggressive: 1, retaliation: 0 });
  },
};

export const HeuristicBot: Agent = {
  name: "Heuristic",
  chooseAction(state) {
    return blendedChooseAction(state, { heuristic: 1, aggressive: 0 });
  },
};

export const PoliticalBot: Agent = {
  name: "Political",
  chooseAction(state) {
    return blendedChooseAction(state, { heuristic: 1, aggressive: 0, political: 0.25 });
  },
};

/**
 * Defensive: prefers safe consolidation. Refuses anything below a high winP
 * floor and weights retaliation heavily. Tends to end turn early.
 */
export const DefensiveBot: Agent = {
  name: "Defensive",
  chooseAction(state) {
    return personalityChooseAction(state, {
      weights: { heuristic: 1, aggressive: 0, retaliation: 1.5 },
      minWinP: 0.6,
    });
  },
};

/**
 * Splitter: ignores own connectivity, maximizes the damage done to whichever
 * opponent has the biggest blob.
 */
export const SplitterBot: Agent = {
  name: "Splitter",
  chooseAction(state) {
    return personalityChooseAction(state, {
      weights: { heuristic: 1, aggressive: 0, enemyConnLoss: 4 },
    });
  },
};

/**
 * Opportunist: refuses to engage stacks of >2 dice. Picks the safest cheap
 * capture; ends turn fast when no soft targets remain.
 */
export const OpportunistBot: Agent = {
  name: "Opportunist",
  chooseAction(state) {
    return personalityChooseAction(state, {
      weights: { heuristic: 1, aggressive: 0 },
      maxDefenderDice: 4,
    });
  },
};

/** Beam-search bot: explores attack sequences within the current turn. */
export const BeamBot: Agent = {
  name: "Beam",
  chooseAction(state) {
    return beamChooseAction(state, {
      weights: { heuristic: 1, aggressive: 0 },
      depth: 4,
      beam: 16,
    });
  },
};

/** Monte Carlo Tree Search bot. */
export const MCTSBot: Agent = {
  name: "MCTS",
  chooseAction(state) {
    return mctsChooseAction(state, {
      iterations: 150,
      rolloutDepth: 60,
      explorationC: 1.2,
    });
  },
};

export type BlendWeights = ScorerWeights;

/** Returns an agent that scores every legal move with the shared scorer. */
export function makeBlendedBot(weights: BlendWeights, label?: string): Agent {
  return {
    name:
      label ??
      `Blend(H${weights.heuristic.toFixed(2)}/A${weights.aggressive.toFixed(2)})`,
    chooseAction(state) {
      return blendedChooseAction(state, weights);
    },
  };
}

function blendedChooseAction(state: GameState, weights: ScorerWeights): AgentAction {
  return personalityChooseAction(state, { weights });
}

interface PersonalityOpts {
  weights: ScorerWeights;
  /** Lower bound on win probability — moves below are discarded outright. */
  minWinP?: number;
  /** Skip moves whose defender stack exceeds this. */
  maxDefenderDice?: number;
}

function personalityChooseAction(state: GameState, opts: PersonalityOpts): AgentAction {
  const moves = legalAttacks(state);
  if (moves.length === 0) return { kind: "endTurn" };

  const ctx = buildContext(state, opts.weights);

  let best: ScoredMove | null = null;
  // Track best move ignoring the personality filters too — used as the
  // anti-stall fallback when filters reject everything and we're forced
  // to take *something* in a 1v1 endgame.
  let bestUnfiltered: ScoredMove | null = null;
  for (const { from, to } of moves) {
    const scored = scoreMove(state, ctx, from, to, opts.weights);
    if (bestUnfiltered === null || scored.score > bestUnfiltered.score) {
      bestUnfiltered = scored;
    }
    if (opts.maxDefenderDice !== undefined) {
      const dst = state.territories[to]!;
      if (dst.dice > opts.maxDefenderDice) continue;
    }
    if (opts.minWinP !== undefined && scored.winP < opts.minWinP) continue;
    if (best === null || scored.score > best.score) best = scored;
  }

  if (best !== null && best.score > 0) {
    return { kind: "attack", from: best.from, to: best.to };
  }

  // Anti-stall: in a 1v1 endgame, refusing to attack is strictly worse than
  // a coin-flip attack — reinforcement is symmetric and the game can only
  // end via a capture. Force the best available attack when we're not the
  // leader. Personality filters (minWinP/maxDefenderDice) are intentionally
  // ignored here: in a forced-stall, "any progress" outweighs personality.
  if (shouldForceAttack(state, ctx) && bestUnfiltered !== null) {
    return { kind: "attack", from: bestUnfiltered.from, to: bestUnfiltered.to };
  }

  return { kind: "endTurn" };
}

function shouldForceAttack(state: GameState, ctx: ReturnType<typeof buildContext>): boolean {
  if (ctx.aliveCount !== 2) return false;
  // I'm trailing or tied on territory count — passing only widens the gap.
  let myCount = ctx.territoryCount[ctx.me]!;
  let oppCount = 0;
  for (let i = 0; i < ctx.territoryCount.length; i++) {
    if (i === ctx.me) continue;
    if (state.players[i]?.alive) oppCount = Math.max(oppCount, ctx.territoryCount[i]!);
  }
  return myCount <= oppCount;
}
