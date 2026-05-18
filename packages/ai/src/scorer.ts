/**
 * Single-move scorer shared by the heuristic, beam, and MCTS bots.
 *
 * Score components:
 *   - heuristic (EV in dice-equivalent units):
 *       winP · captureValue − (1−winP) · lossCost
 *     captureValue = dst.dice + connGain*W_CONN + enemyConnLoss*W_ENEMY_CONN,
 *     optionally amplified by political dominance multiplier.
 *   - retaliation: expected loss if a strong neighbor retakes the captured
 *     territory. Subtracted from the score.
 *   - aggressive (raw dice diff): a separate signal for "greedy" personalities.
 *
 * winP is computed against the true rules (including the underdog roll-with-
 * advantage bonus), so a weak attacker correctly values its boosted odds.
 */
import {
  GameState,
  largestConnectedSize,
  PlayerId,
  TerritoryId,
} from "@opendicewar/core";
import { winProbability } from "./ev";

const W_CONN = 1.2;
const W_ENEMY_CONN = 1.0;

/** Quadratic-above-fair-share dominance scale. Tuned so a player controlling
 *  half the map yields a bonus of ~16 (~5× captureValue at political=0.25). */
export const DOMINANCE_K = 150;

/** Excess (dominance minus fair share) at which a 0.25-political bot's
 *  captureValue multiplier reaches ~1.56× — the threshold for "substantial"
 *  targeting. Used by isSubstantialTarget for UI markers. */
export const SUBSTANTIAL_EXCESS = 0.15;

export interface ScorerContext {
  /** Player id whose turn it is. */
  me: PlayerId;
  /** My largest connected component size, pre-move. */
  baseConn: number;
  /** Per-enemy largest connected component size, pre-move. */
  enemyBaseConn: number[];
  /** Per-owner political dominance multiplier addend (zero for me/dead). */
  ownerBonus: number[] | null;
}

export function buildContext(
  state: GameState,
  weights: { political?: number },
): ScorerContext {
  const me = state.currentPlayer;
  const N = state.players.length;
  const baseConn = largestConnectedSize(state, me);
  const enemyBaseConn = new Array<number>(N).fill(0);
  for (const p of state.players) {
    if (!p.alive || p.id === me) continue;
    enemyBaseConn[p.id] = largestConnectedSize(state, p.id);
  }
  const politicalW = weights.political ?? 0;
  const ownerBonus = politicalW > 0 ? computeOwnerDominanceBonus(state, me) : null;
  return { me, baseConn, enemyBaseConn, ownerBonus };
}

export interface ScorerWeights {
  /** Weight on expected-value scoring (win probability × capture value). */
  heuristic: number;
  /** Weight on raw dice-advantage scoring (src.dice - dst.dice). */
  aggressive: number;
  /** Strength of leader-targeting bias (multiplier on captureValue). */
  political?: number;
  /** Strength of retaliation penalty. Default 1.0; 0 disables. */
  retaliation?: number;
  /** Weight on opponent-largest-blob loss (default 1.0; 0 disables). */
  enemyConnLoss?: number;
}

export interface ScoredMove {
  from: TerritoryId;
  to: TerritoryId;
  score: number;
  /** Decomposed for debugging / personality bots. */
  winP: number;
  heuristicScore: number;
  aggressiveScore: number;
  retaliationPenalty: number;
  connGain: number;
  enemyConnLoss: number;
}

export function scoreMove(
  state: GameState,
  ctx: ScorerContext,
  from: TerritoryId,
  to: TerritoryId,
  w: ScorerWeights,
): ScoredMove {
  const src = state.territories[from]!;
  const dst = state.territories[to]!;
  const defenderOwner = dst.owner;

  const winP = winProbability(src.dice, dst.dice);

  const projectedConn = projectedLargestAfter(state, ctx.me, to);
  const connGain = projectedConn - ctx.baseConn;

  const enemyLoss = defenderOwner >= 0
    ? ctx.enemyBaseConn[defenderOwner]! -
        projectedLargestAfterCapture(state, defenderOwner, to)
    : 0;

  let captureValue =
    dst.dice + connGain * W_CONN + enemyLoss * (w.enemyConnLoss ?? W_ENEMY_CONN);
  if (ctx.ownerBonus !== null && defenderOwner >= 0) {
    captureValue *= 1 + (w.political ?? 0) * ctx.ownerBonus[defenderOwner]!;
  }

  const lossCost = src.dice - 1;
  const heuristicScore = winP * captureValue - (1 - winP) * lossCost;

  // Retaliation: after a win, dst has src.dice-1 and src has 1. Both are
  // exposed. Subtract the EV of being retaken (winP_enemy * value_lost).
  const retaW = w.retaliation ?? 1;
  let retaliationPenalty = 0;
  if (retaW > 0) {
    retaliationPenalty = retaW * winP * expectedRetaliationLoss(state, ctx, from, to);
  }

  const aggressiveScore = src.dice - dst.dice;

  const score =
    w.heuristic * heuristicScore +
    w.aggressive * aggressiveScore -
    retaliationPenalty;

  return {
    from,
    to,
    score,
    winP,
    heuristicScore,
    aggressiveScore,
    retaliationPenalty,
    connGain,
    enemyConnLoss: enemyLoss,
  };
}

/**
 * Expected loss from immediate retaliation: enemy's strongest stack adjacent
 * to the captured territory (or to the now-empty source) attacks back.
 *
 * Models the worst single retaliator only — chain retaliation is out of scope
 * here. Returns dice-equivalent expected value.
 */
function expectedRetaliationLoss(
  state: GameState,
  ctx: ScorerContext,
  from: TerritoryId,
  to: TerritoryId,
): number {
  const src = state.territories[from]!;
  const dst = state.territories[to]!;
  const postCapDice = src.dice - 1; // dice on captured territory after the win
  const me = ctx.me;

  let worstAtDst = 0;
  // Enemies adjacent to the captured territory (excluding what was the
  // attacker's source — that becomes mine).
  for (const nbr of dst.neighbors) {
    if (nbr === from) continue;
    const n = state.territories[nbr]!;
    if (n.owner === me) continue;
    if (n.owner < 0) continue;
    if (n.dice < 2) continue;
    const wp = winProbability(n.dice, postCapDice);
    // Value lost: the captured dice + the territory itself (rough proxy = dice).
    const loss = wp * postCapDice;
    if (loss > worstAtDst) worstAtDst = loss;
  }
  // Note: post-attack src has 1 die — anything can take it, but the loss is
  // tiny (~1 die value) and an enemy gaining a 1-die foothold inside our
  // territory is generally not catastrophic. Skip modelling it.
  return worstAtDst;
}

function projectedLargestAfter(
  state: GameState,
  player: PlayerId,
  newlyOwned: TerritoryId,
): number {
  return largestConnectedWith(state, (id, t) => t.owner === player || id === newlyOwned);
}

function projectedLargestAfterCapture(
  state: GameState,
  losingOwner: PlayerId,
  lost: TerritoryId,
): number {
  return largestConnectedWith(
    state,
    (id, t) => t.owner === losingOwner && id !== lost,
  );
}

function largestConnectedWith(
  state: GameState,
  isOwned: (id: TerritoryId, t: GameState["territories"][number]) => boolean,
): number {
  const owned = new Set<TerritoryId>();
  state.territories.forEach((t, i) => {
    if (isOwned(i, t)) owned.add(i);
  });
  if (owned.size === 0) return 0;
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

interface ShareTotals {
  terr: number[];
  dice: number[];
  terrDenom: number;
  diceDenom: number;
}

function precomputeShares(state: GameState): ShareTotals {
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
  return {
    terr,
    dice,
    terrDenom: Math.max(1, totalTerr),
    diceDenom: Math.max(1, totalDice),
  };
}

function dominance(state: GameState, playerId: number, shares: ShareTotals): number {
  const conn = largestConnectedSize(state, playerId);
  return (
    0.4 * (shares.terr[playerId]! / shares.terrDenom) +
    0.35 * (conn / shares.terrDenom) +
    0.25 * (shares.dice[playerId]! / shares.diceDenom)
  );
}

function fairShareOf(state: GameState): number {
  let aliveCount = 0;
  for (const p of state.players) if (p.alive) aliveCount++;
  return aliveCount > 0 ? 1 / aliveCount : 1;
}

/** True when the player is dominating the board enough that a 0.25-weight
 *  PoliticalBot would substantially amplify attacks against them. */
export function isSubstantialTarget(state: GameState, playerId: number): boolean {
  const p = state.players[playerId];
  if (!p || !p.alive) return false;
  const shares = precomputeShares(state);
  const dom = dominance(state, playerId, shares);
  return dom - fairShareOf(state) >= SUBSTANTIAL_EXCESS;
}

function computeOwnerDominanceBonus(state: GameState, me: number): number[] {
  const N = state.players.length;
  const shares = precomputeShares(state);
  const fairShare = fairShareOf(state);
  const bonus = new Array<number>(N).fill(0);
  for (const p of state.players) {
    if (!p.alive || p.id === me) continue;
    const excess = Math.max(0, dominance(state, p.id, shares) - fairShare);
    bonus[p.id] = excess * excess * DOMINANCE_K;
  }
  return bonus;
}
