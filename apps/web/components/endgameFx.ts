const WIN_COLORS = [
  "#ffd54f",
  "#ff5252",
  "#42a5f5",
  "#66bb6a",
  "#ab47bc",
  "#ffa726",
  "#26c6da",
  "#ffffff",
];
const ASH_COLORS = ["#666", "#444", "#888", "#3a3a3a"];

export interface Piece {
  left: number;
  color: string;
  delay: number;
  duration: number;
  rot: number;
}

export function makeConfetti(n: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: Math.random() * 100,
      color: WIN_COLORS[i % WIN_COLORS.length]!,
      delay: Math.random() * 1.8,
      duration: 2.4 + Math.random() * 2.2,
      rot: Math.random() * 360,
    });
  }
  return out;
}

export function makeAsh(n: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: Math.random() * 100,
      color: ASH_COLORS[i % ASH_COLORS.length]!,
      delay: Math.random() * 3,
      duration: 5 + Math.random() * 3,
      rot: Math.random() * 360,
    });
  }
  return out;
}

export function makeRays(n: number): Array<{ angle: number; delay: number }> {
  const out: Array<{ angle: number; delay: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ angle: (360 / n) * i, delay: (i % 3) * 0.08 });
  }
  return out;
}
