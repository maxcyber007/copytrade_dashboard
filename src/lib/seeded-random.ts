/**
 * Deterministic PRNG (mulberry32).
 *
 * The landing page charts seed their opening series with this so the
 * server-rendered markup and the first client render match exactly — seeding
 * with Math.random would hydrate-mismatch on every load. Live updates after
 * mount are client-only and can use the same generator to stay reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
