/**
 * Turn-local beam search.
 *
 * Idea: a single turn is a sequence of attacks ending in endTurn. The state
 * space for that sequence is exponential, but most branches are dominated.
 * Keep the top `beam` partial sequences by cumulative score and expand them
 * up to `depth` ply.
 *
 * Branches are *expected* states: we don't roll dice. Each attack node yields
 * two successor states (win and loss) weighted by winP, but tracking that
 * full tree explodes the beam. Instead, we evaluate the *expected score*
 * (which already captures both branches via winP and lossCost) and apply the
 * win-branch state transition for forward planning. This biases search
 * toward optimistic sequences — partially compensated by the retaliation
 * term in the scorer, which docks moves that leave us exposed even on win.
 *
 * Empirically this catches the high-value sequences (chain attacks from a
 * big stack) without exploding compute.
 */
import {
  GameState,
  legalAttacks,
  Territory,
  TerritoryId,
} from "@opendicewar/core";
import { buildContext, scoreMove, ScorerWeights } from "./scorer";

export interface BeamOptions {
  weights: ScorerWeights;
  /** Max number of attacks in any single sequence. */
  depth: number;
  /** Max nodes kept at each depth. */
  beam: number;
}

interface Node {
  /** Cumulative expected score for the sequence so far, properly weighted
   *  by the probability of *reaching* this branch. */
  cumScore: number;
  /** Product of step win probabilities so far — probability we actually
   *  arrive at this node along the win-branch path. */
  cumProb: number;
  /** Speculative board after applying win-branch transitions for each step. */
  state: GameState;
  /** First-move (from, to) — the one we'd actually play to reach this branch. */
  firstFrom: TerritoryId;
  firstTo: TerritoryId;
}

export type BeamChoice =
  | { kind: "attack"; from: TerritoryId; to: TerritoryId }
  | { kind: "endTurn" };

export function beamChooseAction(state: GameState, opts: BeamOptions): BeamChoice {
  const root = legalAttacks(state);
  if (root.length === 0) return { kind: "endTurn" };

  // Seed beam with all first-moves.
  const initialCtx = buildContext(state, opts.weights);
  let frontier: Node[] = [];
  let bestNegative: { from: TerritoryId; to: TerritoryId; score: number } | null = null;
  for (const m of root) {
    const scored = scoreMove(state, initialCtx, m.from, m.to, opts.weights);
    if (scored.score <= 0) {
      if (bestNegative === null || scored.score > bestNegative.score) {
        bestNegative = { from: m.from, to: m.to, score: scored.score };
      }
      continue;
    }
    const next = simulateWinBranch(state, m.from, m.to);
    frontier.push({
      cumScore: scored.score, // step 1 cumProb is 1 by construction
      cumProb: scored.winP,
      state: next,
      firstFrom: m.from,
      firstTo: m.to,
    });
  }
  if (frontier.length === 0) {
    // Anti-stall fallback — same rationale as personalityChooseAction.
    if (bestNegative !== null && shouldForceAttackBeam(state, initialCtx)) {
      return { kind: "attack", from: bestNegative.from, to: bestNegative.to };
    }
    return { kind: "endTurn" };
  }

  frontier = topK(frontier, opts.beam);

  let bestSoFar = frontier[0]!;
  for (let depth = 1; depth < opts.depth; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      const moves = legalAttacks(node.state);
      if (moves.length === 0) continue;
      const ctx = buildContext(node.state, opts.weights);
      for (const m of moves) {
        const scored = scoreMove(node.state, ctx, m.from, m.to, opts.weights);
        if (scored.score <= 0) continue;
        const childState = simulateWinBranch(node.state, m.from, m.to);
        // Probability-weighted contribution: this step is only realized if
        // every prior attack in the sequence also won (cumProb).
        next.push({
          cumScore: node.cumScore + node.cumProb * scored.score,
          cumProb: node.cumProb * scored.winP,
          state: childState,
          firstFrom: node.firstFrom,
          firstTo: node.firstTo,
        });
      }
    }
    if (next.length === 0) break;
    frontier = topK(next, opts.beam);
    if (frontier[0]!.cumScore > bestSoFar.cumScore) bestSoFar = frontier[0]!;
  }

  return { kind: "attack", from: bestSoFar.firstFrom, to: bestSoFar.firstTo };
}

function shouldForceAttackBeam(
  state: GameState,
  ctx: ReturnType<typeof buildContext>,
): boolean {
  if (ctx.aliveCount !== 2) return false;
  const myCount = ctx.territoryCount[ctx.me]!;
  let oppCount = 0;
  for (let i = 0; i < ctx.territoryCount.length; i++) {
    if (i === ctx.me) continue;
    if (state.players[i]?.alive) oppCount = Math.max(oppCount, ctx.territoryCount[i]!);
  }
  return myCount <= oppCount;
}

function topK(nodes: Node[], k: number): Node[] {
  if (nodes.length <= k) {
    nodes.sort((a, b) => b.cumScore - a.cumScore);
    return nodes;
  }
  // Partial sort via Array.sort is fine at our scales (k=16, ~few hundred).
  nodes.sort((a, b) => b.cumScore - a.cumScore);
  return nodes.slice(0, k);
}

/**
 * Apply only the *win* branch of an attack to a copied state. Just rewrites
 * the two affected territories: faster than going through applyAttack (which
 * rolls dice, logs history, and advances RNG).
 *
 * Geometry (cells, neighbors) is shared by reference — only mutated bits
 * need cloning.
 */
function simulateWinBranch(
  state: GameState,
  from: TerritoryId,
  to: TerritoryId,
): GameState {
  const src = state.territories[from]!;
  const dst = state.territories[to]!;
  const territories: Territory[] = state.territories.slice();
  territories[from] = { ...src, dice: 1 };
  territories[to] = { ...dst, owner: src.owner, dice: src.dice - 1 };
  return { ...state, territories };
}
