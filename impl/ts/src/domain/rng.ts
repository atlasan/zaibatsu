// A small, seedable pseudo-random generator: a 64-bit LCG using the same
// constants as impl/go/internal/domain/rng.go, so both mirrors produce identical
// sequences from the same seed — the determinism contract in DOCS/parity.md.
//
// Never use Math.random in the engine; thread an Rng through so games are
// reproducible from a seed.

const MASK64 = (1n << 64n) - 1n;
const MUL = 6364136223846793005n;
const INC = 1442695040888963407n;

export class Rng {
  private state: bigint;

  constructor(seed: number | bigint) {
    this.state = BigInt(seed) & MASK64;
    // Advance once so seed 0 doesn't yield a degenerate first output.
    this.next32();
  }

  private next32(): number {
    this.state = (this.state * MUL + INC) & MASK64;
    return Number((this.state >> 32n) & 0xffffffffn);
  }

  /** Returns a pseudo-random int in [0, n). Throws if n <= 0. */
  intn(n: number): number {
    if (n <= 0) throw new Error("Rng.intn: n must be > 0");
    return this.next32() % n;
  }

  /** In-place Fisher–Yates shuffle, mirroring rng.go exactly. */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.intn(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
  }
}

export function newRng(seed: number | bigint): Rng {
  return new Rng(seed);
}
