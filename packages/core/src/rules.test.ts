import { describe, expect, it } from "vitest";
import { applyAttack, applyEndTurn, legalAttacks } from "./rules";
import { newGame } from "./map";

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
