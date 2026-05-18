export type PlayerId = number;
export type TerritoryId = number;
export type CellId = number;

export interface HexCell {
  id: CellId;
  q: number;
  r: number;
  territory: TerritoryId;
}

export interface Territory {
  id: TerritoryId;
  owner: PlayerId;
  dice: number;
  cells: CellId[];
  neighbors: TerritoryId[];
  /** Territories reachable across a single hex of water — used for naval
   *  attacks when GameState.navalAttacks is on. Disjoint from `neighbors`. */
  coastNeighbors: TerritoryId[];
}

export interface PlayerState {
  id: PlayerId;
  alive: boolean;
  stock: number;
  color: string;
}

export type Phase = "attack" | "reinforce" | "ended";

export interface GameState {
  seed: number;
  rngState: number;
  turn: number;
  currentPlayer: PlayerId;
  phase: Phase;
  cells: HexCell[];
  territories: Territory[];
  players: PlayerState[];
  history: Action[];
  /** When true, coastal territories may attack their coastNeighbors across
   *  water (one water-hex range). A deviation from the original Dicewars. */
  navalAttacks: boolean;
}

export type Action =
  | AttackAction
  | EndTurnAction
  | ReinforceAction;

export interface AttackAction {
  kind: "attack";
  player: PlayerId;
  from: TerritoryId;
  to: TerritoryId;
  rolls: { atk: number[]; def: number[] };
  result: "win" | "loss";
}

export interface EndTurnAction {
  kind: "endTurn";
  player: PlayerId;
}

export interface ReinforceAction {
  kind: "reinforce";
  player: PlayerId;
  placements: Array<{ territory: TerritoryId; added: number }>;
  stockDelta: number;
}

export const MAX_DICE_PER_TERRITORY = 16;
export const MAX_STOCK = 64;
