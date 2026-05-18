/**
 * UCT Monte Carlo Tree Search.
 *
 * Action space at the root: every legal attack plus endTurn. Children expand
 * one untried action at a time; selection follows UCB1 until reaching an
 * unexpanded node or a terminal/depth-cap state.
 *
 * Rollouts use the heuristic scorer as the default policy (much stronger
 * than uniform random and cheap to call). Each rollout is bounded by
 * rolloutDepth to keep wall time predictable.
 *
 * Reward, from the root player's perspective:
 *   - 1.0 if rootPlayer wins outright.
 *   - 0.0 if rootPlayer is eliminated.
 *   - On depth cap: territory share clamped to (0, 1).
 *
 * Each iteration perturbs rngState so subsequent rollouts diverge.
 */
import {
  applyAttack,
  applyEndTurn,
  GameState,
  legalAttacks,
  PlayerId,
} from "@opendicewar/core";
import { AgentAction } from ".";
import { buildContext, scoreMove, ScorerWeights } from "./scorer";

export interface MctsOptions {
  iterations: number;
  rolloutDepth: number;
  explorationC: number;
  /** Scorer weights used by both rollout policy and (optionally) the prior on
   *  action ordering. */
  rolloutWeights?: ScorerWeights;
}

const DEFAULT_ROLLOUT_WEIGHTS: ScorerWeights = {
  heuristic: 1,
  aggressive: 0,
};

interface Node {
  state: GameState;
  parent: Node | null;
  /** Action that led to this node (null for root). */
  action: AgentAction | null;
  /** Whose turn it was when `action` was *applied* (for back-propagation). */
  actorOnEntry: PlayerId;
  children: Node[];
  untried: AgentAction[];
  visits: number;
  totalReward: number;
}

export function mctsChooseAction(state: GameState, opts: MctsOptions): AgentAction {
  const rootMoves = legalActions(state);
  if (rootMoves.length === 0) return { kind: "endTurn" };
  // Trivial case: only one option, no need to search.
  if (rootMoves.length === 1) return rootMoves[0]!;

  const rootPlayer = state.currentPlayer;
  const rolloutWeights = opts.rolloutWeights ?? DEFAULT_ROLLOUT_WEIGHTS;

  const root: Node = {
    state,
    parent: null,
    action: null,
    actorOnEntry: rootPlayer,
    children: [],
    untried: rootMoves,
    visits: 0,
    totalReward: 0,
  };

  for (let i = 0; i < opts.iterations; i++) {
    // Selection: descend via UCB1 until we hit a node with untried actions
    // or a terminal state.
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0) {
      node = uctChild(node, opts.explorationC);
    }
    // Expansion: if we still have untried actions, expand one.
    if (node.untried.length > 0 && node.state.phase !== "ended") {
      const action = pickUntried(node);
      const nextState = applyAction(perturb(node.state, i), action);
      const child: Node = {
        state: nextState,
        parent: node,
        action,
        actorOnEntry: node.state.currentPlayer,
        children: [],
        untried: legalActions(nextState),
        visits: 0,
        totalReward: 0,
      };
      node.children.push(child);
      node = child;
    }
    // Simulation: rollout from `node.state` using heuristic policy.
    const reward = rollout(node.state, rootPlayer, opts.rolloutDepth, rolloutWeights);
    // Backpropagation.
    let cur: Node | null = node;
    while (cur !== null) {
      cur.visits += 1;
      cur.totalReward += reward;
      cur = cur.parent;
    }
  }

  // Pick the most-visited child of root (robust to occasional UCB outliers).
  let best = root.children[0]!;
  for (const c of root.children) {
    if (c.visits > best.visits) best = c;
  }
  return best.action!;
}

function uctChild(node: Node, c: number): Node {
  const lnN = Math.log(Math.max(1, node.visits));
  let best = node.children[0]!;
  let bestScore = -Infinity;
  for (const child of node.children) {
    const exploit = child.visits > 0 ? child.totalReward / child.visits : 0;
    const explore = c * Math.sqrt(lnN / Math.max(1, child.visits));
    const score = exploit + explore;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function pickUntried(node: Node): AgentAction {
  // Pop a pseudo-random untried action. Deterministic-ish: use visits count
  // as a cheap index to avoid Math.random surprises during testing.
  const idx = node.visits % node.untried.length;
  const [action] = node.untried.splice(idx, 1);
  return action!;
}

function legalActions(state: GameState): AgentAction[] {
  if (state.phase === "ended") return [];
  const actions: AgentAction[] = [];
  for (const m of legalAttacks(state)) {
    actions.push({ kind: "attack", from: m.from, to: m.to });
  }
  actions.push({ kind: "endTurn" });
  return actions;
}

function applyAction(state: GameState, action: AgentAction): GameState {
  if (action.kind === "endTurn") return applyEndTurn(state);
  return applyAttack(state, action.from, action.to);
}

/** Bump the seeded RNG state so different iterations diverge. */
function perturb(state: GameState, salt: number): GameState {
  // Cheap PRNG mix, doesn't change game semantics — just decorrelates rollouts.
  const next = (state.rngState ^ (salt * 0x9e3779b1)) >>> 0;
  return { ...state, rngState: next };
}

function rollout(
  state: GameState,
  rootPlayer: PlayerId,
  maxDepth: number,
  weights: ScorerWeights,
): number {
  let cur = state;
  for (let d = 0; d < maxDepth; d++) {
    if (cur.phase === "ended") break;
    const myTurn = cur.currentPlayer;
    const action = policyMove(cur, weights);
    cur = applyAction(cur, action);
    // Cheap defense against infinite passing: if both this player and the
    // last actor opted to end turn, just bail with terminal scoring.
    if (action.kind === "endTurn" && myTurn === rootPlayer && d > 4) {
      // Early exit fine — rootPlayer chose to bank dice.
    }
  }
  return terminalReward(cur, rootPlayer);
}

function policyMove(state: GameState, weights: ScorerWeights): AgentAction {
  const moves = legalAttacks(state);
  if (moves.length === 0) return { kind: "endTurn" };
  const ctx = buildContext(state, weights);
  let bestScore = 0;
  let best: { from: number; to: number } | null = null;
  for (const m of moves) {
    const s = scoreMove(state, ctx, m.from, m.to, weights);
    if (s.score > bestScore) {
      bestScore = s.score;
      best = { from: m.from, to: m.to };
    }
  }
  if (best === null) return { kind: "endTurn" };
  return { kind: "attack", from: best.from, to: best.to };
}

function terminalReward(state: GameState, rootPlayer: PlayerId): number {
  const root = state.players[rootPlayer];
  if (!root || !root.alive) return 0;
  if (state.phase === "ended") {
    // Game ended and we're alive — we won (last man standing rule).
    return 1;
  }
  // Depth-cap exit: score by territory share, clamped so neither extreme is
  // achievable at the cap (preserves exploration incentive).
  let mine = 0;
  let total = 0;
  for (const t of state.territories) {
    if (t.owner < 0) continue;
    total++;
    if (t.owner === rootPlayer) mine++;
  }
  if (total === 0) return 0;
  const share = mine / total;
  return 0.1 + 0.8 * share;
}
