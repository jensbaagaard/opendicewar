export interface Rng {
  state: number;
  next(): number;
  int(maxExclusive: number): number;
  d6(): number;
}

export function createRng(seed: number): Rng {
  const rng = {
    state: seed >>> 0,
    next(): number {
      let t = (rng.state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(rng.next() * maxExclusive);
    },
    d6(): number {
      return rng.int(6) + 1;
    },
  };
  return rng;
}

export function rngFromState(state: number): Rng {
  const rng = createRng(0);
  rng.state = state >>> 0;
  return rng;
}
