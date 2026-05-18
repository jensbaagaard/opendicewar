import { describe, expect, it } from "vitest";
import { applyEndTurn, largestConnectedSize } from "./rules";
import { newGame } from "./map";
import { GameState, MAX_DICE_PER_TERRITORY, ReinforceAction } from "./types";

function findReinforce(state: GameState): ReinforceAction | undefined {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const a = state.history[i];
    if (a && a.kind === "reinforce") return a;
  }
  return undefined;
}

describe("reinforce", () => {
  it("places all income dice when towers have capacity", () => {
    const g = newGame({ seed: 7, playerCount: 2, territoryCount: 8 });
    // Force player 0's territories to have plenty of room (1 die each).
    for (const t of g.territories) if (t.owner === 0) t.dice = 1;
    g.players[0]!.stock = 0;

    const before = g.territories
      .filter((t) => t.owner === 0)
      .reduce((s, t) => s + t.dice, 0);

    const next = applyEndTurn(g);
    const action = findReinforce(next)!;
    const placed = action.placements.reduce((s, p) => s + p.added, 0);

    const after = next.territories
      .filter((t) => t.owner === 0)
      .reduce((s, t) => s + t.dice, 0);

    expect(after - before).toBe(placed);
    expect(action.stockDelta).toBe(0);
    expect(next.players[0]!.stock).toBe(0);
  });

  it("overflows to stock when all owned towers are full", () => {
    const g = newGame({ seed: 7, playerCount: 2, territoryCount: 8 });
    for (const t of g.territories) {
      if (t.owner === 0) t.dice = MAX_DICE_PER_TERRITORY;
    }
    g.players[0]!.stock = 0;

    const next = applyEndTurn(g);
    const action = findReinforce(next)!;

    expect(action.placements).toHaveLength(0);
    expect(next.players[0]!.stock).toBeGreaterThan(0);
  });

  it("reported scenario: income 18 + stock 8, only 2 non-full towers", () => {
    // Construct a state where the human owns a large connected region so
    // largestConnectedSize gives ~18; cap all but two of their owned towers
    // at MAX. Stock = 8. Expect the 2 non-full towers to fill.
    const g = newGame({
      seed: 3,
      playerCount: 7,
      territoryCount: 32,
      gridWidth: 32,
      gridHeight: 32,
      cellsPerTerritory: 24,
    });
    // Hand the human a lot of territory so income is big.
    for (const t of g.territories) t.owner = 0;
    g.currentPlayer = 0;
    // Make sure the other players are still considered alive in players[]
    // by leaving a single territory to each (so newAlive recomputes won't
    // matter here — we go straight into reinforce).
    const owned = g.territories.filter((t) => t.owner === 0);
    for (let i = 0; i < owned.length; i++) {
      owned[i]!.dice = i < 2 ? 1 : MAX_DICE_PER_TERRITORY; // 2 nearly empty, rest full
    }
    g.players[0]!.stock = 8;

    const income = largestConnectedSize(g, 0);
    const expectedPool = income + 8;
    const nonFullIds = owned.slice(0, 2).map((t) => t.id);
    const roomBefore = MAX_DICE_PER_TERRITORY * 2 - 2; // both at 1 → 30 room

    const next = applyEndTurn(g);

    const placed =
      (next.territories[nonFullIds[0]!]!.dice - 1) +
      (next.territories[nonFullIds[1]!]!.dice - 1);

    // If pool ≥ room, both should fill to MAX.
    if (expectedPool >= roomBefore) {
      expect(next.territories[nonFullIds[0]!]!.dice).toBe(MAX_DICE_PER_TERRITORY);
      expect(next.territories[nonFullIds[1]!]!.dice).toBe(MAX_DICE_PER_TERRITORY);
    } else {
      // Otherwise we should have placed the entire pool (nothing else is eligible).
      expect(placed).toBe(expectedPool);
    }
  });

  it("late-game: fills the 2 non-full towers when pool >> room", () => {
    // User's reported scenario: only 2 towers missing dice, 18 income, 8 stock.
    // Expected: those 2 towers fill to MAX, leftover to stock.
    const g = newGame({ seed: 11, playerCount: 2, territoryCount: 8 });
    g.currentPlayer = 0;
    const owned = g.territories.filter((t) => t.owner === 0);
    // Cap all but two at MAX. The two non-full are at 10 (room=6 each = 12 total room).
    for (let i = 0; i < owned.length; i++) {
      owned[i]!.dice = i < 2 ? 10 : MAX_DICE_PER_TERRITORY;
    }
    // Pump the stock high enough that pool clearly exceeds the 12 room.
    g.players[0]!.stock = 50;

    const next = applyEndTurn(g);
    const nonFullIds = owned.slice(0, 2).map((t) => t.id);

    // Both should now be at MAX.
    expect(next.territories[nonFullIds[0]!]!.dice).toBe(MAX_DICE_PER_TERRITORY);
    expect(next.territories[nonFullIds[1]!]!.dice).toBe(MAX_DICE_PER_TERRITORY);
  });

  it("fills non-full towers before overflowing to stock", () => {
    const g = newGame({ seed: 7, playerCount: 2, territoryCount: 8 });
    const owned = g.territories.filter((t) => t.owner === 0);
    // Cap all but one at max; leave just 1 die of room on the last one.
    // Forced stock makes the pool large enough to spill over.
    for (let i = 0; i < owned.length - 1; i++) {
      owned[i]!.dice = MAX_DICE_PER_TERRITORY;
    }
    const lone = owned[owned.length - 1]!;
    lone.dice = MAX_DICE_PER_TERRITORY - 1;
    g.players[0]!.stock = 50;

    const next = applyEndTurn(g);
    const action = findReinforce(next)!;
    const placed = action.placements.reduce((s, p) => s + p.added, 0);

    expect(placed).toBe(1);
    expect(next.territories[lone.id]!.dice).toBe(MAX_DICE_PER_TERRITORY);
    expect(next.players[0]!.stock).toBeGreaterThan(0);
  });
});
