import { HEX_DIRS, axialKey } from "./hex";
import { createRng, Rng } from "./rng";
import {
  CellId,
  GameState,
  HexCell,
  MAX_DICE_PER_TERRITORY,
  PlayerState,
  Territory,
  TerritoryId,
} from "./types";

const DEFAULT_COLORS = [
  "#5da9e9", // cyan/blue
  "#3f8e3f", // dark green
  "#f1c40f", // yellow
  "#7bc950", // light green
  "#8e44ad", // purple
  "#e67e22", // orange
  "#e91e63", // pink
  "#1abc9c", // teal
];

export interface NewGameOptions {
  seed: number;
  playerCount: number;
  /** Total territories on the map. Default 32. */
  territoryCount?: number;
  /** Hex grid extent. Default 14×10. */
  gridWidth?: number;
  gridHeight?: number;
  /** Average cells per territory. Default 4. */
  cellsPerTerritory?: number;
  startingDicePerTerritory?: number;
}

export interface MapData {
  cells: HexCell[];
  territories: Territory[];
}

export function newGame(opts: NewGameOptions): GameState {
  const playerCount = clamp(opts.playerCount, 2, 8);
  const territoryCount = opts.territoryCount ?? 32;
  const startingDice = opts.startingDicePerTerritory ?? 3;
  const rng = createRng(opts.seed);

  const map = generateMap(rng, {
    territoryCount,
    gridWidth: opts.gridWidth ?? 14,
    gridHeight: opts.gridHeight ?? 10,
    cellsPerTerritory: opts.cellsPerTerritory ?? 4,
  });

  assignOwners(map.territories, playerCount, rng);
  distributeStartingDice(map.territories, playerCount, startingDice, rng);

  const players: PlayerState[] = [];
  for (let p = 0; p < playerCount; p++) {
    players.push({
      id: p,
      alive: true,
      stock: 0,
      color: DEFAULT_COLORS[p % DEFAULT_COLORS.length]!,
    });
  }

  return {
    seed: opts.seed,
    rngState: rng.state,
    turn: 0,
    currentPlayer: 0,
    phase: "attack",
    cells: map.cells,
    territories: map.territories,
    players,
    history: [],
  };
}

/** Convenience for renderers — returns the cells generated for a seed. */
export function generateMapForSeed(opts: NewGameOptions): MapData {
  const rng = createRng(opts.seed);
  return generateMap(rng, {
    territoryCount: opts.territoryCount ?? 32,
    gridWidth: opts.gridWidth ?? 14,
    gridHeight: opts.gridHeight ?? 10,
    cellsPerTerritory: opts.cellsPerTerritory ?? 4,
  });
}

interface GenOpts {
  territoryCount: number;
  gridWidth: number;
  gridHeight: number;
  cellsPerTerritory: number;
}

function generateMap(rng: Rng, opts: GenOpts): MapData {
  // 1. Build an axial parallelogram grid.
  const grid = new Map<string, { q: number; r: number; id: CellId; territory: TerritoryId }>();
  const allKeys: string[] = [];
  let id = 0;
  for (let r = 0; r < opts.gridHeight; r++) {
    for (let q = -Math.floor(r / 2); q < opts.gridWidth - Math.floor(r / 2); q++) {
      const k = axialKey(q, r);
      grid.set(k, { q, r, id: id++, territory: -1 });
      allKeys.push(k);
    }
  }

  // 2. Seed N territory cores at random unique cells.
  const wanted = opts.territoryCount;
  const shuffled = [...allKeys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const cores = shuffled.slice(0, wanted);

  // 3. Multi-source BFS expansion, each territory claims cells until budget exhausted.
  const queues: string[][] = cores.map((k) => [k]);
  const targetSize = opts.cellsPerTerritory;
  const sizes: number[] = new Array(wanted).fill(0);
  cores.forEach((k, t) => {
    const cell = grid.get(k)!;
    cell.territory = t;
    sizes[t] = 1;
  });

  let progress = true;
  while (progress) {
    progress = false;
    for (let t = 0; t < wanted; t++) {
      if (sizes[t]! >= targetSize) continue;
      const queue = queues[t]!;
      if (queue.length === 0) continue;
      // Pick a random frontier cell for organic blob shapes.
      const idx = rng.int(queue.length);
      const fromKey = queue[idx]!;
      queue.splice(idx, 1);
      const from = grid.get(fromKey)!;

      const shuffledDirs = [...HEX_DIRS];
      for (let i = shuffledDirs.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [shuffledDirs[i], shuffledDirs[j]] = [shuffledDirs[j]!, shuffledDirs[i]!];
      }

      for (const d of shuffledDirs) {
        if (sizes[t]! >= targetSize) break;
        const nk = axialKey(from.q + d.q, from.r + d.r);
        const n = grid.get(nk);
        if (!n || n.territory !== -1) continue;
        n.territory = t;
        sizes[t]! += 1;
        queue.push(nk);
        progress = true;
      }
    }
  }

  // 4. Drop unclaimed cells; collect territory members.
  const cellsByTerritory: Map<TerritoryId, CellId[]> = new Map();
  const cells: HexCell[] = [];
  const cellMeta = new Map<CellId, { q: number; r: number; territory: TerritoryId }>();
  let newId = 0;
  for (const k of allKeys) {
    const c = grid.get(k)!;
    if (c.territory === -1) continue;
    const cellId = newId++;
    cells.push({ id: cellId, q: c.q, r: c.r, territory: c.territory });
    cellMeta.set(cellId, { q: c.q, r: c.r, territory: c.territory });
    if (!cellsByTerritory.has(c.territory)) cellsByTerritory.set(c.territory, []);
    cellsByTerritory.get(c.territory)!.push(cellId);
  }

  // 5. Build territory adjacency: territories share an edge if any of their cells are hex-adjacent.
  const adjacency: Set<TerritoryId>[] = Array.from({ length: wanted }, () => new Set<TerritoryId>());
  const cellByCoord = new Map<string, CellId>();
  for (const c of cells) cellByCoord.set(axialKey(c.q, c.r), c.id);
  for (const c of cells) {
    for (const d of HEX_DIRS) {
      const nid = cellByCoord.get(axialKey(c.q + d.q, c.r + d.r));
      if (nid === undefined) continue;
      const other = cellMeta.get(nid)!;
      if (other.territory !== c.territory) {
        adjacency[c.territory]!.add(other.territory);
        adjacency[other.territory]!.add(c.territory);
      }
    }
  }

  // 6. Materialize territories. Drop any with zero cells.
  const territories: Territory[] = [];
  const remap = new Map<TerritoryId, TerritoryId>();
  for (let t = 0; t < wanted; t++) {
    const members = cellsByTerritory.get(t);
    if (!members || members.length === 0) continue;
    const newTid = territories.length;
    remap.set(t, newTid);
    territories.push({
      id: newTid,
      owner: -1,
      dice: 1,
      cells: members,
      neighbors: [],
    });
  }
  for (let t = 0; t < wanted; t++) {
    const newTid = remap.get(t);
    if (newTid === undefined) continue;
    territories[newTid]!.neighbors = [...adjacency[t]!]
      .map((x) => remap.get(x))
      .filter((x): x is TerritoryId => x !== undefined)
      .sort((a, b) => a - b);
  }
  // Re-id cells' territory references through the remap.
  for (const c of cells) {
    c.territory = remap.get(c.territory)!;
  }

  return { cells, territories };
}

function assignOwners(territories: Territory[], playerCount: number, rng: Rng): void {
  const ids = territories.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  ids.forEach((tid, i) => {
    territories[tid]!.owner = i % playerCount;
  });
}

function distributeStartingDice(
  territories: Territory[],
  playerCount: number,
  startingDice: number,
  rng: Rng,
): void {
  for (let p = 0; p < playerCount; p++) {
    const owned = territories.filter((t) => t.owner === p);
    let budget = owned.length * (startingDice - 1);
    while (budget > 0) {
      const eligible = owned.filter((t) => t.dice < MAX_DICE_PER_TERRITORY);
      if (eligible.length === 0) break;
      const pick = eligible[rng.int(eligible.length)]!;
      pick.dice += 1;
      budget -= 1;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
