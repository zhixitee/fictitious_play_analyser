/**
 * Seeded Random Number Generator
 * 
 * Uses Mulberry32 algorithm for deterministic, reproducible random sequences.
 * This enables reproducible simulations when a seed is provided.
 */

export type RNG = () => number;

/**
 * Mulberry32 seeded RNG (fast, deterministic)
 * @param seed - Integer seed value
 * @returns Function that generates random numbers in [0, 1)
 */
export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create RNG with optional seed (uses random seed if not provided)
 */
export function createRNG(seed?: number): { rng: RNG; seed: number } {
  const actualSeed = seed ?? Math.floor(Math.random() * 1e9);
  return { rng: mulberry32(actualSeed), seed: actualSeed };
}

/**
 * Random integer in [min, max] (inclusive)
 */
export function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Uniform float in [min, max)
 */
export function randUniform(rng: RNG, min: number, max: number): number {
  return min + (max - min) * rng();
}
