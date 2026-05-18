export interface Shard {
  angle: number;
  distance: number;
  color: string;
  delay: number;
  size: number;
  round: boolean;
}

export interface ShardOptions {
  /** Fourth palette color (after event color, white, accent yellow). */
  accentColor: string;
  /** Minimum shard travel distance in px. */
  distanceBase: number;
  /** Random extra travel distance added on top of `distanceBase`. */
  distanceJitter: number;
  /** Maximum stagger delay in ms (Math.floor(Math.random() * delayMax)). */
  delayMax: number;
  /** Random extra size added to the base 10px shard size. */
  sizeJitter: number;
}

export function makeShards(n: number, color: string, opts: ShardOptions): Shard[] {
  const palette = [color, "#fff", "#ffd54f", opts.accentColor];
  const out: Shard[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      angle: (360 / n) * i + (Math.random() - 0.5) * 12,
      distance: opts.distanceBase + Math.random() * opts.distanceJitter,
      color: palette[i % palette.length]!,
      delay: Math.floor(Math.random() * opts.delayMax),
      size: 10 + Math.random() * opts.sizeJitter,
      round: i % 2 === 0,
    });
  }
  return out;
}
