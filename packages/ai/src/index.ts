import {
  GameState,
  largestConnectedSize,
  legalAttacks,
  TerritoryId,
} from "@opendicewar/core";
import { winProbability } from "./ev";

export { winProbability } from "./ev";

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
    return blendedChooseAction(state, { heuristic: 0, aggressive: 1 });
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

export interface BlendWeights {
  /** Weight on expected-value scoring (win probability × capture value). */
  heuristic: number;
  /** Weight on raw dice-advantage scoring (src.dice - dst.dice). */
  aggressive: number;
  /** Strength of leader-targeting bias. Multiplier (not a blend share):
   *  amplifies captureValue when the target's owner is dominating the board.
   *  Quadratic in dominance excess, so small leads barely register but a
   *  player controlling half the map gets heavily targeted even at 0.25. */
  political?: number;
}

/** Returns an agent that scores every legal move as a weighted blend of the
 *  heuristic (EV) and aggressive (dice-diff) signals. */
export function makeBlendedBot(weights: BlendWeights, label?: string): Agent {
  return {
    name: label ?? `Blend(H${weights.heuristic.toFixed(2)}/A${weights.aggressive.toFixed(2)})`,
    chooseAction(state) {
      return blendedChooseAction(state, weights);
    },
  };
}

function blendedChooseAction(state: GameState, weights: BlendWeights): AgentAction {
  const moves = legalAttacks(state);
  if (moves.length === 0) return { kind: "endTurn" };

  const me = state.currentPlayer;
  const baseConn = largestConnectedSize(state, me);

  const politicalW = weights.political ?? 0;
  const ownerBonus = politicalW > 0 ? computeOwnerDominanceBonus(state, me) : null;

  let best: { from: TerritoryId; to: TerritoryId; score: number } | null = null;
  for (const { from, to } of moves) {
    const src = state.territories[from]!;
    const dst = state.territories[to]!;

    const winP = winProbability(src.dice, dst.dice);

    // --- Heuristic signal (EV in dice-equivalent units) ---
    const projectedConn = projectedLargestAfter(state, me, from, to);
    const connGain = projectedConn - baseConn;
    let captureValue = dst.dice + connGain * 1.2;
    if (ownerBonus !== null) {
      captureValue *= 1 + politicalW * ownerBonus[dst.owner]!;
    }
    const lossCost = src.dice - 1;
    const heuristicScore = winP * captureValue - (1 - winP) * lossCost;

    // --- Aggressive signal (raw dice advantage) ---
    const aggressiveScore = src.dice - dst.dice;

    const score = weights.heuristic * heuristicScore + weights.aggressive * aggressiveScore;
    if (best === null || score > best.score) best = { from, to, score };
  }

  if (best === null || best.score <= 0) return { kind: "endTurn" };
  return { kind: "attack", from: best.from, to: best.to };
}

/** Quadratic-above-fair-share dominance scale. Tuned so a player controlling
 *  half the map yields a bonus of ~10 (10× captureValue at political=1.0,
 *  ~3.7× at political=0.25). Near fair share, bonus ≈ 0. */
const DOMINANCE_K = 100;

/** Returns a per-player additive bonus, indexed by PlayerId. Zero for the
 *  current player and for dead/non-dominant opponents. */
function computeOwnerDominanceBonus(state: GameState, me: number): number[] {
  const N = state.players.length;
  const terr = new Array<number>(N).fill(0);
  const dice = new Array<number>(N).fill(0);
  let totalDice = 0;
  let totalTerr = 0;
  for (const t of state.territories) {
    if (t.owner < 0) continue;
    terr[t.owner]!++;
    dice[t.owner]! += t.dice;
    totalDice += t.dice;
    totalTerr++;
  }

  let aliveCount = 0;
  for (const p of state.players) if (p.alive) aliveCount++;
  const fairShare = aliveCount > 0 ? 1 / aliveCount : 1;
  const diceDenom = Math.max(1, totalDice);
  const terrDenom = Math.max(1, totalTerr);

  const bonus = new Array<number>(N).fill(0);
  for (const p of state.players) {
    if (!p.alive || p.id === me) continue;
    const conn = largestConnectedSize(state, p.id);
    const dom =
      0.4 * (terr[p.id]! / terrDenom) +
      0.35 * (conn / terrDenom) +
      0.25 * (dice[p.id]! / diceDenom);
    const excess = Math.max(0, dom - fairShare);
    bonus[p.id] = excess * excess * DOMINANCE_K;
  }
  return bonus;
}

function projectedLargestAfter(
  state: GameState,
  player: number,
  from: TerritoryId,
  to: TerritoryId,
): number {
  void from;
  const owned = new Set<TerritoryId>();
  state.territories.forEach((t, i) => {
    if (t.owner === player || i === to) owned.add(i);
  });
  const visited = new Set<TerritoryId>();
  let best = 0;
  for (const start of owned) {
    if (visited.has(start)) continue;
    const stack = [start];
    let size = 0;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      size += 1;
      for (const n of state.territories[cur]!.neighbors) {
        if (owned.has(n) && !visited.has(n)) stack.push(n);
      }
    }
    if (size > best) best = size;
  }
  return best;
}

export const AGENTS: Record<string, Agent> = {
  random: RandomBot,
  greedy: GreedyBot,
  heuristic: HeuristicBot,
  political: PoliticalBot,
};
