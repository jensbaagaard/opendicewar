import { test, expect, Page } from "@playwright/test";

/**
 * E2E tests for the reinforce step. We drive the human player programmatically
 * through window.__dicewar.endTurn() and assert dice invariants on the state
 * returned synchronously from that call (i.e., the state captured immediately
 * after the human's reinforce, before any bot acts).
 */

const MAX_DICE_PER_TERRITORY = 16;
const MAX_STOCK = 64;

type Territory = {
  id: number;
  owner: number;
  dice: number;
  neighbors: number[];
};
type Player = { id: number; alive: boolean; stock: number };
type ReinforceAction = {
  kind: "reinforce";
  player: number;
  placements: Array<{ territory: number; added: number }>;
  stockDelta: number;
};
type GameState = {
  turn: number;
  phase: "attack" | "reinforce" | "ended";
  currentPlayer: number;
  territories: Territory[];
  players: Player[];
  history: Array<ReinforceAction | { kind: string }>;
};

/** Number of dice on the largest connected component of `player`'s territories. */
function largestConnectedSize(state: GameState, player: number): number {
  const owned = new Set(
    state.territories.filter((t) => t.owner === player).map((t) => t.id),
  );
  const visited = new Set<number>();
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

async function gotoSeed(page: Page, seed: number) {
  await page.goto(`/play?seed=${seed}&fast=1`);
  await page.waitForFunction(
    () => Boolean((window as unknown as { __dicewar?: unknown }).__dicewar),
  );
  await page.waitForFunction((s) => {
    const w = window as unknown as { __dicewar: { state: { seed: number } } };
    return w.__dicewar.state.seed === s;
  }, seed);
  // Game now has a "BEGIN" gate before bots run. Click it.
  const begin = page.getByRole("button", { name: "BEGIN" });
  if (await begin.count()) await begin.click();
}

async function readState(page: Page): Promise<GameState> {
  return await page.evaluate(() => {
    const w = window as unknown as { __dicewar: { state: GameState } };
    return JSON.parse(JSON.stringify(w.__dicewar.state));
  });
}

async function waitForHumanTurnOrEnd(page: Page) {
  try {
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __dicewar: { state: { currentPlayer: number; phase: string } };
      };
      return (
        w.__dicewar.state.currentPlayer === 0 ||
        w.__dicewar.state.phase === "ended"
      );
    }, undefined, { timeout: 15_000 });
  } catch (err) {
    const snapshot = await page.evaluate(() => {
      const w = window as unknown as {
        __dicewar: { state: { currentPlayer: number; phase: string; turn: number; players: Array<{ alive: boolean }> } };
      };
      return {
        currentPlayer: w.__dicewar.state.currentPlayer,
        phase: w.__dicewar.state.phase,
        turn: w.__dicewar.state.turn,
        alive: w.__dicewar.state.players.map((p) => p.alive),
      };
    });
    throw new Error(
      `waitForHumanTurnOrEnd timed out. snapshot=${JSON.stringify(snapshot)}: ${(err as Error).message}`,
    );
  }
}

/**
 * Calls endTurn() for the human and returns the post-reinforce state captured
 * synchronously inside the page. This is the moment right after the human's
 * reinforce ran but before any bot has acted.
 */
async function humanEndTurn(page: Page): Promise<GameState | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __dicewar: { endTurn: () => GameState | null };
    };
    const next = w.__dicewar.endTurn();
    return next ? JSON.parse(JSON.stringify(next)) : null;
  });
}

/**
 * Core invariant for a freshly-reinforced player: if they have stock > 0,
 * every owned territory must be at MAX. Otherwise the loop in rules.ts:98-107
 * would have placed those dice on a tower instead.
 */
function assertFillBeforeStock(
  state: GameState,
  player: number,
  ctx: { seed: number; turn: number },
) {
  const stock = state.players[player]!.stock;
  if (stock <= 0) return;
  const owned = state.territories.filter((t) => t.owner === player);
  const nonFull = owned.filter((t) => t.dice < MAX_DICE_PER_TERRITORY);
  expect(
    nonFull.map((t) => ({ id: t.id, dice: t.dice })),
    `seed ${ctx.seed} turn ${ctx.turn} player ${player}: stock=${stock} but non-full towers exist`,
  ).toEqual([]);
}

function assertReinforceConsistency(
  before: GameState,
  after: GameState,
  reinforce: ReinforceAction,
  ctx: { seed: number; turn: number },
) {
  const player = reinforce.player;
  const stockBefore = before.players[player]!.stock;
  const stockAfter = after.players[player]!.stock;
  const income = largestConnectedSize(before, player);
  const placedSum = reinforce.placements.reduce((s, p) => s + p.added, 0);

  expect(
    stockAfter - stockBefore,
    `seed ${ctx.seed} turn ${ctx.turn} player ${player}: stockDelta mismatch`,
  ).toBe(reinforce.stockDelta);

  const poolStart = income + stockBefore;
  const expectedNewStock = Math.min(poolStart - placedSum, MAX_STOCK);
  expect(
    stockAfter,
    `seed ${ctx.seed} turn ${ctx.turn} player ${player}: conservation broken (income=${income} stockBefore=${stockBefore} placed=${placedSum})`,
  ).toBe(expectedNewStock);

  for (const t of after.territories.filter((t) => t.owner === player)) {
    expect(t.dice).toBeLessThanOrEqual(MAX_DICE_PER_TERRITORY);
  }
}

test.describe("reinforce invariants", () => {
  // 8 seeds, played until human's turn comes around enough times or game ends.
  for (const seed of [101, 202, 303, 404, 505, 606, 707, 808]) {
    test(`seed ${seed}: human reinforce respects fill-then-stock rule`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await gotoSeed(page, seed);

      let humanTurns = 0;
      let safety = 0;
      while (humanTurns < 80 && safety < 2000) {
        safety++;
        const before = await readState(page);
        if (before.phase === "ended") break;
        if (before.currentPlayer !== 0) {
          await waitForHumanTurnOrEnd(page);
          continue;
        }
        if (!before.players[0]!.alive) break;

        const post = await humanEndTurn(page);
        expect(post, "endTurn must succeed for human turn").not.toBeNull();
        const state = post!;
        const ctx = { seed, turn: state.turn };

        const reinforce = [...state.history]
          .reverse()
          .find(
            (a): a is ReinforceAction =>
              a.kind === "reinforce" && (a as ReinforceAction).player === 0,
          );
        expect(reinforce, "human reinforce must be recorded").toBeDefined();

        assertReinforceConsistency(before, state, reinforce!, ctx);
        assertFillBeforeStock(state, 0, ctx);

        humanTurns++;
        await waitForHumanTurnOrEnd(page);
      }
    });
  }

  // Across a long game, every observed state must satisfy the invariant for
  // every player. (Their dice/stock don't change between their own reinforces,
  // so the invariant is preserved.)
  test("fill-before-stock holds for all players across a full game", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoSeed(page, 9999);

    let safety = 0;
    while (safety < 1500) {
      safety++;
      const state = await readState(page);
      for (let p = 0; p < state.players.length; p++) {
        if (!state.players[p]!.alive) continue;
        assertFillBeforeStock(state, p, { seed: 9999, turn: state.turn });
      }
      if (state.phase === "ended") break;
      if (state.currentPlayer === 0) {
        await humanEndTurn(page);
      } else {
        await waitForHumanTurnOrEnd(page);
      }
    }
  });
});
