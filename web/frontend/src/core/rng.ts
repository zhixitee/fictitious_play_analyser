export type RNG = () => number;

// Mulberry32: fast, deterministic seeded PRNG producing values in [0, 1).
export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRNG(seed?: number): { rng: RNG; seed: number } {
  const actualSeed = seed ?? Math.floor(Math.random() * 1e9);
  return { rng: mulberry32(actualSeed), seed: actualSeed };
}

export function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randUniform(rng: RNG, min: number, max: number): number {
  return min + (max - min) * rng();
}
