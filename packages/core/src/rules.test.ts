import { describe, expect, it } from "vitest";
import { applyAttack, applyEndTurn, isLegalAttack, isUnderdog, legalAttacks } from "./rules";
import { newGame } from "./map";
import { GameState } from "./types";

function makeMinimalState(playerDice: number[][]): GameState {
  const players = playerDice.map((dice, id) => ({
    id,
    alive: dice.length > 0,
    stock: 0,
    color: "#fff",
  }));
  const territories: GameState["territories"] = [];
  let tid = 0;
  for (let p = 0; p < playerDice.length; p++) {
    for (const d of playerDice[p]!) {
      territories.push({
        id: tid++,
        owner: p,
        dice: d,
        cells: [],
        neighbors: [],
        coastNeighbors: [],
      });
    }
  }
  return {
    seed: 0,
    rngState: 1,
    turn: 0,
    currentPlayer: 0,
    phase: "attack",
    cells: [],
    territories,
    players,
    history: [],
    navalAttacks: false,
  };
}

describe("rules", () => {
  it("creates a game with valid initial state", () => {
    const g = newGame({ seed: 1, playerCount: 4, territoryCount: 16 });
    expect(g.players).toHaveLength(4);
    expect(g.territories).toHaveLength(16);
    expect(g.phase).toBe("attack");
    expect(g.players.every((p) => p.alive)).toBe(true);
  });

  it("rejects illegal attacks", () => {
    const g = newGame({ seed: 1, playerCount: 2, territoryCount: 8 });
    expect(() => applyAttack(g, 0, 0)).toThrow();
  });

  it("can complete a turn via endTurn", () => {
    const g = newGame({ seed: 1, playerCount: 2, territoryCount: 8 });
    const next = applyEndTurn(g);
    expect(next.turn).toBe(1);
    expect(next.currentPlayer).toBe((g.currentPlayer + 1) % 2);
  });

  it("returns at least one legal attack from a fresh board", () => {
    const g = newGame({ seed: 1, playerCount: 4, territoryCount: 16 });
    expect(legalAttacks(g).length).toBeGreaterThan(0);
  });

  it("is deterministic given the same seed", () => {
    const a = newGame({ seed: 42, playerCount: 4, territoryCount: 16 });
    const b = newGame({ seed: 42, playerCount: 4, territoryCount: 16 });
    expect(a).toEqual(b);
  });

  it("isUnderdog returns false when only two players are alive", () => {
    const s = makeMinimalState([[2, 3], [4, 5]]);
    expect(isUnderdog(s, 0)).toBe(false);
  });

  it("isUnderdog flags a substantially weaker player when >2 alive", () => {
    // Player 0: 3 dice. Others avg 10. 3 < 0.5*10 → underdog.
    const s = makeMinimalState([[3], [10], [10]]);
    expect(isUnderdog(s, 0)).toBe(true);
    expect(isUnderdog(s, 1)).toBe(false);
  });

  it("isUnderdog returns false for near-parity strength", () => {
    const s = makeMinimalState([[8], [10], [12]]);
    expect(isUnderdog(s, 0)).toBe(false);
  });

  it("isUnderdog ignores dead players in the average", () => {
    // Dead player has [] (no territories). Alive: P0=3, P1=10, P2=10.
    // With dead P3 ignored: aliveCount=3, otherMean=10 → 3 < 5 → underdog.
    const s = makeMinimalState([[3], [10], [10], []]);
    expect(isUnderdog(s, 0)).toBe(true);
  });

  it("naval attacks are illegal by default", () => {
    const s = makeMinimalState([[3], [1]]);
    s.territories[0]!.coastNeighbors = [1];
    expect(isLegalAttack(s, 0, 1)).toBe(false);
    expect(legalAttacks(s)).toEqual([]);
  });

  it("naval attacks become legal when the toggle is on", () => {
    const s = makeMinimalState([[3], [1]]);
    s.territories[0]!.coastNeighbors = [1];
    s.navalAttacks = true;
    expect(isLegalAttack(s, 0, 1)).toBe(true);
    expect(legalAttacks(s)).toEqual([{ from: 0, to: 1 }]);
  });

  it("naval and land neighbors don't double-count in legalAttacks", () => {
    // A defensive sanity check: land takes precedence; coast list is disjoint.
    const s = makeMinimalState([[3], [1]]);
    s.territories[0]!.neighbors = [1];
    s.territories[0]!.coastNeighbors = []; // map gen guarantees this disjointness
    s.navalAttacks = true;
    expect(legalAttacks(s)).toEqual([{ from: 0, to: 1 }]);
  });

  it("map gen produces coast neighbors disjoint from land neighbors", () => {
    const g = newGame({
      seed: 7,
      playerCount: 7,
      territoryCount: 32,
      gridWidth: 32,
      gridHeight: 32,
      cellsPerTerritory: 24,
      navalAttacks: true,
    });
    let totalCoast = 0;
    for (const t of g.territories) {
      totalCoast += t.coastNeighbors.length;
      for (const cn of t.coastNeighbors) {
        expect(t.neighbors).not.toContain(cn);
        // Symmetric.
        expect(g.territories[cn]!.coastNeighbors).toContain(t.id);
      }
    }
    // The default board has plenty of coastline; at least one pair should exist.
    expect(totalCoast).toBeGreaterThan(0);
  });

  it("produces a connected territory adjacency graph", () => {
    // Sweep a range of seeds to be confident the bridge step holds up.
    for (let seed = 1; seed <= 25; seed++) {
      const g = newGame({
        seed,
        playerCount: 7,
        territoryCount: 32,
        gridWidth: 32,
        gridHeight: 32,
        cellsPerTerritory: 24,
      });
      // BFS on the territory adjacency graph.
      const visited = new Set<number>([0]);
      const stack = [0];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const n of g.territories[cur]!.neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            stack.push(n);
          }
        }
      }
      expect(visited.size).toBe(g.territories.length);
    }
  });
});
