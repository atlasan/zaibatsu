package domain

// RNG is a small, seedable pseudo-random generator. It is a 64-bit LCG using the
// same constants as impl/ts/src/domain/rng.ts, so both mirrors produce identical
// sequences from the same seed — the determinism contract in DOCS/parity.md.
//
// Never use a global/unseeded random source in the engine; thread an *RNG through
// so games are reproducible from a seed.
type RNG struct {
	state uint64
}

const (
	lcgMul = 6364136223846793005
	lcgInc = 1442695040888963407
)

// NewRNG creates a generator seeded with the given value.
func NewRNG(seed uint64) *RNG {
	r := &RNG{state: seed}
	// Advance once so seed 0 doesn't yield a degenerate first output.
	r.next32()
	return r
}

func (r *RNG) next32() uint32 {
	r.state = r.state*lcgMul + lcgInc
	return uint32(r.state >> 32)
}

// Intn returns a pseudo-random int in [0, n). Panics if n <= 0.
func (r *RNG) Intn(n int) int {
	if n <= 0 {
		panic("RNG.Intn: n must be > 0")
	}
	return int(r.next32() % uint32(n))
}

// Shuffle performs an in-place Fisher–Yates shuffle driven by this RNG.
// It mirrors rng.ts shuffle exactly (same loop direction and index math).
func (r *RNG) Shuffle(s []string) {
	for i := len(s) - 1; i > 0; i-- {
		j := r.Intn(i + 1)
		s[i], s[j] = s[j], s[i]
	}
}
