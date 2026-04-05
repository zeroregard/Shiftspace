/**
 * Deterministic seeded PRNG (Linear Congruential Generator).
 *
 * Replaces `Math.random` with a seeded version so the mock engine produces
 * identical file selections and simulation outcomes across page loads.
 * This keeps E2E screenshot baselines stable.
 *
 * The seed can be overridden via the `?seed=<number>` query parameter.
 */

const DEFAULT_SEED = 0xdeadbeef;

function parseSeedFromURL(): number {
  if (typeof window === 'undefined') return DEFAULT_SEED;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  if (raw === null) return DEFAULT_SEED;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_SEED;
}

/** Install a seeded `Math.random` replacement. Call once at app startup. */
export function installSeededRandom(): void {
  let seed = parseSeedFromURL();
  Math.random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 0x100000000;
  };
}
