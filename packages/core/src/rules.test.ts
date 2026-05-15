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
    expect(next.currentPlayer).toBe(1);
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
});
