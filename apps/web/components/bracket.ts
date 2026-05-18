import type { BlendWeights } from "@opendicewar/ai";

export const HUMAN_CONTESTANT_ID = 0;
export const BRACKET_REROLLS_PER_MATCH = 4;
export const BRACKET_SIZE = 8;
export const ROUND_LABELS = ["Quarterfinal", "Semifinal", "Final"] as const;
export const ROUND_LABELS_SHORT = ["QF", "SF", "F"] as const;

export interface Contestant {
  id: number;
  name: string;
  emblem: string;
  color: string;
  /** null = human; otherwise the BlendWeights used to simulate this bot. */
  weights: BlendWeights | null;
}

export interface BracketMatch {
  /** Stable slot indices the bracket UI lays out around. */
  slot: number;
  /** Round index: 0=QF, 1=SF, 2=F. */
  round: number;
  /** Contestant ids; null = TBD (later rounds before predecessors resolve). */
  a: number | null;
  b: number | null;
  winner: number | null;
  /** Source slots (previous round) that feed this match. null for round 0. */
  fromA: number | null;
  fromB: number | null;
}

export interface BracketState {
  active: boolean;
  contestants: Contestant[];
  /** rounds[0..2]; lengths are 4, 2, 1. Each match has a stable `slot`. */
  rounds: BracketMatch[][];
  currentRound: number;
  rerollsLeft: number;
  rerollsUsed: number;
  outcome: "playing" | "champion" | "eliminated";
}

const BOT_ROSTER: Array<Omit<Contestant, "id" | "weights">> = [
  { name: "Razor", emblem: "⚔", color: "#ff5252" },
  { name: "Cipher", emblem: "♛", color: "#42a5f5" },
  { name: "Hex", emblem: "✶", color: "#ab47bc" },
  { name: "Ember", emblem: "✦", color: "#ffa726" },
  { name: "Frost", emblem: "❄", color: "#26c6da" },
  { name: "Vortex", emblem: "✺", color: "#66bb6a" },
  { name: "Specter", emblem: "☗", color: "#bdbdbd" },
];

/** Roster of bot personalities — 7 entries paired with the human to make 8. */
const BOT_WEIGHTS: BlendWeights[] = [
  { heuristic: 0.2, aggressive: 0.8, political: 0 },     // Razor — pure bruiser
  { heuristic: 0.85, aggressive: 0.15, political: 0 },   // Cipher — careful
  { heuristic: 0.55, aggressive: 0.25, political: 0.4 }, // Hex — kingmaker
  { heuristic: 0.4, aggressive: 0.6, political: 0.15 },  // Ember — wildcard
  { heuristic: 0.7, aggressive: 0.3, political: 0.1 },   // Frost — composed
  { heuristic: 0.35, aggressive: 0.55, political: 0.25 },// Vortex — chaotic
  { heuristic: 0.65, aggressive: 0.45, political: 0.2 }, // Specter — sneaky
];

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function rngFromSeed(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function strength(c: Contestant): number {
  if (!c.weights) return 0.55; // human baseline; only used when bots simulate each other
  // Aggressive bots win marginally more often head-to-head; careful bots are steadier.
  return 0.45 + c.weights.heuristic * 0.25 + c.weights.aggressive * 0.15;
}

export function generateBracket(seed: number, humanColor: string): BracketState {
  const rand = rngFromSeed((seed ^ 0x9e3779b9) >>> 0);
  const human: Contestant = {
    id: HUMAN_CONTESTANT_ID,
    name: "YOU",
    emblem: "★",
    color: humanColor,
    weights: null,
  };
  const bots: Contestant[] = BOT_ROSTER.map((b, i) => ({
    id: i + 1,
    ...b,
    weights: BOT_WEIGHTS[i]!,
  }));
  const contestants = [human, ...bots];

  // Seed the human in slot 0; shuffle bots into the remaining 7 slots.
  const lineup = [human, ...shuffle(bots, rand)];

  const qf: BracketMatch[] = [
    { slot: 0, round: 0, a: lineup[0]!.id, b: lineup[1]!.id, winner: null, fromA: null, fromB: null },
    { slot: 1, round: 0, a: lineup[2]!.id, b: lineup[3]!.id, winner: null, fromA: null, fromB: null },
    { slot: 2, round: 0, a: lineup[4]!.id, b: lineup[5]!.id, winner: null, fromA: null, fromB: null },
    { slot: 3, round: 0, a: lineup[6]!.id, b: lineup[7]!.id, winner: null, fromA: null, fromB: null },
  ];
  const sf: BracketMatch[] = [
    { slot: 4, round: 1, a: null, b: null, winner: null, fromA: 0, fromB: 1 },
    { slot: 5, round: 1, a: null, b: null, winner: null, fromA: 2, fromB: 3 },
  ];
  const f: BracketMatch[] = [
    { slot: 6, round: 2, a: null, b: null, winner: null, fromA: 4, fromB: 5 },
  ];

  return {
    active: true,
    contestants,
    rounds: [qf, sf, f],
    currentRound: 0,
    rerollsLeft: BRACKET_REROLLS_PER_MATCH,
    rerollsUsed: 0,
    outcome: "playing",
  };
}

export function findHumanMatch(b: BracketState): BracketMatch | null {
  const round = b.rounds[b.currentRound];
  if (!round) return null;
  return (
    round.find(
      (m) =>
        (m.a === HUMAN_CONTESTANT_ID || m.b === HUMAN_CONTESTANT_ID) &&
        m.winner === null,
    ) ?? null
  );
}

/** Resolves any not-yet-decided bot vs bot matches in the given round. */
function resolveBotMatches(b: BracketState, roundIdx: number, rand: () => number): BracketState {
  const next = cloneRounds(b.rounds);
  const round = next[roundIdx];
  if (!round) return b;
  for (const m of round) {
    if (m.winner !== null) continue;
    if (m.a === null || m.b === null) continue;
    if (m.a === HUMAN_CONTESTANT_ID || m.b === HUMAN_CONTESTANT_ID) continue;
    const ca = b.contestants[m.a]!;
    const cb = b.contestants[m.b]!;
    const pa = strength(ca);
    const pb = strength(cb);
    m.winner = rand() < pa / (pa + pb) ? ca.id : cb.id;
  }
  return { ...b, rounds: next };
}

/** Fills the next round's matchups from this round's winners. */
function propagateWinners(b: BracketState, roundIdx: number): BracketState {
  const nextIdx = roundIdx + 1;
  const nextRound = b.rounds[nextIdx];
  if (!nextRound) return b;
  const decided = b.rounds[roundIdx];
  if (!decided) return b;
  const rounds = cloneRounds(b.rounds);
  for (const m of rounds[nextIdx]!) {
    const srcA = m.fromA !== null ? decided.find((x) => x.slot === m.fromA) : null;
    const srcB = m.fromB !== null ? decided.find((x) => x.slot === m.fromB) : null;
    if (srcA && srcA.winner !== null) m.a = srcA.winner;
    if (srcB && srcB.winner !== null) m.b = srcB.winner;
  }
  return { ...b, rounds };
}

function cloneRounds(rounds: BracketMatch[][]): BracketMatch[][] {
  return rounds.map((round) => round.map((m) => ({ ...m })));
}

/** Mark the human's current match as won and propagate. Returns updated state. */
export function applyHumanWin(b: BracketState, seed: number): BracketState {
  const match = findHumanMatch(b);
  if (!match) return b;
  let next: BracketState = { ...b, rounds: cloneRounds(b.rounds) };
  const r = next.rounds[b.currentRound]!;
  const target = r.find((m) => m.slot === match.slot)!;
  target.winner = HUMAN_CONTESTANT_ID;

  const rand = rngFromSeed((seed ^ 0x85ebca6b ^ b.currentRound) >>> 0);
  next = resolveBotMatches(next, b.currentRound, rand);
  next = propagateWinners(next, b.currentRound);

  const isFinal = b.currentRound >= next.rounds.length - 1;
  if (isFinal) {
    return { ...next, outcome: "champion" };
  }
  return {
    ...next,
    currentRound: b.currentRound + 1,
    rerollsLeft: BRACKET_REROLLS_PER_MATCH,
  };
}

/** Mark the human's current match as a loss; tournament is over. */
export function applyHumanLoss(b: BracketState): BracketState {
  const match = findHumanMatch(b);
  if (!match) return { ...b, outcome: "eliminated" };
  const rounds = cloneRounds(b.rounds);
  const target = rounds[b.currentRound]!.find((m) => m.slot === match.slot)!;
  const opponent =
    target.a === HUMAN_CONTESTANT_ID ? target.b : target.a;
  target.winner = opponent;
  return { ...b, rounds, outcome: "eliminated" };
}

export function humanWinsCount(b: BracketState): number {
  let n = 0;
  for (const round of b.rounds) {
    for (const m of round) {
      if (m.winner === HUMAN_CONTESTANT_ID) n++;
    }
  }
  return n;
}

export function humanOpponent(b: BracketState): Contestant | null {
  const m = findHumanMatch(b);
  if (!m) return null;
  const oppId = m.a === HUMAN_CONTESTANT_ID ? m.b : m.a;
  if (oppId === null) return null;
  return b.contestants[oppId] ?? null;
}
