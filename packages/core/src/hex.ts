export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRS: ReadonlyArray<Axial> = [
  { q: +1, r: 0 },
  { q: +1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: +1 },
  { q: 0, r: +1 },
];

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Pointy-top hex layout. `size` is the radius from center to corner. */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

/** Returns the six corner points of a pointy-top hex centered at (cx, cy). */
export function hexCorners(cx: number, cy: number, size: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return out;
}
