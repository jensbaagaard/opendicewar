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
      weights: { heuristic: 1, aggressive: 0, retaliation: 2 },
      minWinP: 0.7,
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
      maxDefenderDice: 2,
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
      iterations: 250,
      rolloutDepth: 80,
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
  for (const { from, to } of moves) {
    if (opts.maxDefenderDice !== undefined) {
      const dst = state.territories[to]!;
      if (dst.dice > opts.maxDefenderDice) continue;
    }
    const scored = scoreMove(state, ctx, from, to, opts.weights);
    if (opts.minWinP !== undefined && scored.winP < opts.minWinP) continue;
    if (best === null || scored.score > best.score) best = scored;
  }

  if (best === null || best.score <= 0) return { kind: "endTurn" };
  return { kind: "attack", from: best.from, to: best.to };
}
