/**
 * Exact win probability for an attacker rolling `atk` d6 against a defender
 * rolling `def` d6, where attacker wins iff their total is strictly greater
 * (ties go to defender, matching Dicewars rules).
 *
 * Computed once on module load via convolution of d6 distributions; cheap.
 */

const MAX = 16;

function d6Distribution(n: number): Map<number, number> {
  if (n === 0) return new Map([[0, 1]]);
  let acc = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < n; i++) {
    const next = new Map<number, number>();
    for (const [sum, p] of acc) {
      for (let face = 1; face <= 6; face++) {
        const s = sum + face;
        next.set(s, (next.get(s) ?? 0) + p / 6);
      }
    }
    acc = next;
  }
  return acc;
}

function buildTable(): number[][] {
  const table: number[][] = [];
  for (let atk = 0; atk <= MAX; atk++) {
    table[atk] = [];
    if (atk < 2) {
      for (let def = 0; def <= MAX; def++) table[atk]![def] = 0;
      continue;
    }
    const atkDist = d6Distribution(atk);
    for (let def = 0; def <= MAX; def++) {
      const defDist = d6Distribution(def);
      let p = 0;
      for (const [as, ap] of atkDist) {
        for (const [ds, dp] of defDist) {
          if (as > ds) p += ap * dp;
        }
      }
      table[atk]![def] = p;
    }
  }
  return table;
}

const WIN_TABLE: ReadonlyArray<ReadonlyArray<number>> = buildTable();

export function winProbability(atkDice: number, defDice: number): number {
  if (atkDice < 2) return 0;
  const a = Math.min(atkDice, MAX);
  const d = Math.min(defDice, MAX);
  return WIN_TABLE[a]![d]!;
}
