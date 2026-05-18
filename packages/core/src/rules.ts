import { rngFromState } from "./rng";
import {
  AttackAction,
  GameState,
  MAX_DICE_PER_TERRITORY,
  MAX_STOCK,
  PlayerId,
  TerritoryId,
} from "./types";

export class IllegalMoveError extends Error {}

export function isLegalAttack(state: GameState, from: TerritoryId, to: TerritoryId): boolean {
  if (state.phase !== "attack") return false;
  const src = state.territories[from];
  const dst = state.territories[to];
  if (!src || !dst) return false;
  if (src.owner !== state.currentPlayer) return false;
  if (dst.owner === state.currentPlayer) return false;
  if (src.dice < 2) return false;
  if (src.neighbors.includes(to)) return true;
  return state.navalAttacks && src.coastNeighbors.includes(to);
}

export function applyAttack(state: GameState, from: TerritoryId, to: TerritoryId): GameState {
  if (!isLegalAttack(state, from, to)) {
    throw new IllegalMoveError(`Illegal attack ${from} -> ${to}`);
  }
  const next = cloneState(state);
  const rng = rngFromState(next.rngState);
  const src = next.territories[from]!;
  const dst = next.territories[to]!;
  const attacker = src.owner;

  // Hidden underdog bonus: weak players (when >2 alive) roll each die twice
  // and keep the higher value. Individual dice still show 1-6, but the
  // expected total is ~28% higher than a fair roll.
  const atkRolls = isUnderdog(next, src.owner)
    ? rollWithAdvantage(rng, src.dice)
    : rollMany(rng, src.dice);
  const defRolls = isUnderdog(next, dst.owner)
    ? rollWithAdvantage(rng, dst.dice)
    : rollMany(rng, dst.dice);
  const atkSum = sum(atkRolls);
  const defSum = sum(defRolls);
  const win = atkSum > defSum;

  let result: "win" | "loss";
  if (win) {
    dst.owner = src.owner;
    dst.dice = src.dice - 1;
    src.dice = 1;
    result = "win";
  } else {
    src.dice = 1;
    result = "loss";
  }

  recomputeAlive(next);
  next.rngState = rng.state;

  const action: AttackAction = {
    kind: "attack",
    player: attacker,
    from,
    to,
    rolls: { atk: atkRolls, def: defRolls },
    result,
  };
  next.history.push(action);

  if (countAlivePlayers(next) <= 1) {
    next.phase = "ended";
  }
  return next;
}

export function applyEndTurn(state: GameState): GameState {
  if (state.phase !== "attack") {
    throw new IllegalMoveError("Cannot end turn outside attack phase");
  }
  let next = cloneState(state);
  next.history.push({ kind: "endTurn", player: next.currentPlayer });

  next = reinforce(next, next.currentPlayer);

  if (next.phase !== "ended") {
    next.currentPlayer = nextAlivePlayer(next, next.currentPlayer);
    next.turn += 1;
    next.phase = "attack";
  }
  return next;
}

function reinforce(state: GameState, player: PlayerId): GameState {
  const rng = rngFromState(state.rngState);
  const owned = state.territories.filter((t) => t.owner === player);
  if (owned.length === 0) {
    state.rngState = rng.state;
    return state;
  }

  const income = largestConnectedSize(state, player);
  const player_ = state.players[player]!;
  let pool = income + player_.stock;
  const placements: Array<{ territory: TerritoryId; added: number }> = [];

  while (pool > 0) {
    const eligible = owned.filter((t) => t.dice < MAX_DICE_PER_TERRITORY);
    if (eligible.length === 0) break;
    const pick = eligible[rng.int(eligible.length)]!;
    pick.dice += 1;
    pool -= 1;
    const existing = placements.find((p) => p.territory === pick.id);
    if (existing) existing.added += 1;
    else placements.push({ territory: pick.id, added: 1 });
  }

  const stockBefore = player_.stock;
  player_.stock = Math.min(pool, MAX_STOCK);

  state.history.push({
    kind: "reinforce",
    player,
    placements,
    stockDelta: player_.stock - stockBefore,
  });

  state.rngState = rng.state;
  return state;
}

/** A player is an underdog when more than two players are alive and their
 *  total dice are less than half the average of the other alive players.
 *  Used by applyAttack to grant a hidden roll bonus. */
export function isUnderdog(state: GameState, playerId: PlayerId): boolean {
  let aliveCount = 0;
  for (const p of state.players) if (p.alive) aliveCount++;
  if (aliveCount <= 2) return false;

  const me = state.players[playerId];
  if (!me || !me.alive) return false;

  let myDice = 0;
  let otherDice = 0;
  let otherCount = 0;
  for (const t of state.territories) {
    if (t.owner < 0) continue;
    const owner = state.players[t.owner];
    if (!owner || !owner.alive) continue;
    if (t.owner === playerId) myDice += t.dice;
    else otherDice += t.dice;
  }
  for (const p of state.players) {
    if (p.alive && p.id !== playerId) otherCount++;
  }
  if (otherCount === 0) return false;
  return myDice < 0.5 * (otherDice / otherCount);
}

export function largestConnectedSize(state: GameState, player: PlayerId): number {
  const owned = new Set(state.territories.filter((t) => t.owner === player).map((t) => t.id));
  const visited = new Set<TerritoryId>();
  let best = 0;
  for (const id of owned) {
    if (visited.has(id)) continue;
    const stack = [id];
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

function recomputeAlive(state: GameState): void {
  for (const p of state.players) {
    p.alive = state.territories.some((t) => t.owner === p.id);
  }
}

function countAlivePlayers(state: GameState): number {
  return state.players.filter((p) => p.alive).length;
}

function nextAlivePlayer(state: GameState, current: PlayerId): PlayerId {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const candidate = (current + i) % n;
    if (state.players[candidate]!.alive) return candidate;
  }
  return current;
}

function rollMany(rng: { d6(): number }, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(rng.d6());
  return out;
}

function rollWithAdvantage(rng: { d6(): number }, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.d6();
    const b = rng.d6();
    out.push(a > b ? a : b);
  }
  return out;
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    cells: state.cells, // immutable map geometry — share the reference
    territories: state.territories.map((t) => ({ ...t, cells: [...t.cells], neighbors: [...t.neighbors] })),
    players: state.players.map((p) => ({ ...p })),
    history: [...state.history],
  };
}

export function legalAttacks(state: GameState): Array<{ from: TerritoryId; to: TerritoryId }> {
  const out: Array<{ from: TerritoryId; to: TerritoryId }> = [];
  if (state.phase !== "attack") return out;
  for (const t of state.territories) {
    if (t.owner !== state.currentPlayer || t.dice < 2) continue;
    for (const n of t.neighbors) {
      if (state.territories[n]!.owner !== state.currentPlayer) {
        out.push({ from: t.id, to: n });
      }
    }
    if (state.navalAttacks) {
      for (const n of t.coastNeighbors) {
        if (state.territories[n]!.owner !== state.currentPlayer) {
          out.push({ from: t.id, to: n });
        }
      }
    }
  }
  return out;
}
