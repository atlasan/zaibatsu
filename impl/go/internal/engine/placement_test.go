package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func newGameForPlacement(t *testing.T) (*domain.GameState, *domain.GameData) {
	t.Helper()
	gd := loadOrSkip(t)
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	if err != nil {
		t.Fatalf("NewGame: %v", err)
	}
	return s, gd
}

func TestSetupPlacesCentralCoreAtOrigin(t *testing.T) {
	s, gd := newGameForPlacement(t)
	if len(s.Cybernet.Blocks) != 1 {
		t.Fatalf("expected 1 block (core) at setup, got %d", len(s.Cybernet.Blocks))
	}
	core := s.Cybernet.At(domain.Coord{Q: 0, R: 0})
	if core == nil {
		t.Fatal("no block at origin")
	}
	def, _ := gd.BlockByID(core.BlockID)
	if def == nil || !def.IsCentralCore {
		t.Errorf("origin block is not the Central Core (%q)", core.BlockID)
	}
}

func TestEdgeHasSpaceRotation(t *testing.T) {
	// A block with a space only on local edge 0.
	b := &domain.Block{Edges: []bool{true, false, false, false, false, false}}
	// Unrotated: space faces grid direction 0.
	if !EdgeHasSpace(b, 0, 0) {
		t.Error("expected space on grid dir 0 with rotation 0")
	}
	if EdgeHasSpace(b, 0, 1) {
		t.Error("did not expect space on grid dir 1 with rotation 0")
	}
	// Rotated by 2: local edge 0 now faces grid direction 2.
	if !EdgeHasSpace(b, 2, 2) {
		t.Error("expected space on grid dir 2 with rotation 2")
	}
	if EdgeHasSpace(b, 2, 0) {
		t.Error("did not expect space on grid dir 0 with rotation 2")
	}
}

func TestCanPlaceRequiresEmptyAdjacentCell(t *testing.T) {
	s, gd := newGameForPlacement(t)
	// The core has spaces on all edges. Place an all-edges block (server-farm has
	// only 3 edges; use data-haven which has edges [T,F,T,T,F,T]).
	origin := domain.Coord{Q: 0, R: 0}
	// Placing onto the origin's own cell is impossible; test occupancy by first
	// placing a block then trying to place another in the same direction.
	if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
		t.Fatalf("first placement failed: %v", err)
	}
	if err := CanPlace(s.Cybernet, gd, origin, 0, "firewall-node", 0); err == nil {
		t.Error("expected occupancy error placing into the same cell")
	}
}

// rotFacing finds a rotation that gives blockID a connecting space toward the
// reference across direction dir (i.e. on the block's edge facing back).
func rotFacing(t *testing.T, gd *domain.GameData, blockID string, dir int) int {
	t.Helper()
	b, _ := gd.BlockByID(blockID)
	for rot := 0; rot < 6; rot++ {
		if EdgeHasSpace(b, rot, domain.Opposite(dir)) {
			return rot
		}
	}
	t.Fatalf("block %q has no edge that can face direction %d", blockID, dir)
	return 0
}

func TestCanPlaceRejectsUnconnectedOrientation(t *testing.T) {
	s, gd := newGameForPlacement(t)
	origin := domain.Coord{Q: 0, R: 0}
	// data-haven edges [T,F,T,T,F,T]. To connect across dir 0, the new block's
	// edge facing back is Opposite(0)=3. Find a rotation where local edge on
	// grid dir 3 is FALSE, and assert it's rejected.
	b, _ := gd.BlockByID("data-haven")
	badRot := -1
	for rot := 0; rot < 6; rot++ {
		if !EdgeHasSpace(b, rot, domain.Opposite(0)) {
			badRot = rot
			break
		}
	}
	if badRot < 0 {
		t.Skip("no unconnected rotation exists for this block")
	}
	if err := CanPlace(s.Cybernet, gd, origin, 0, "data-haven", badRot); err == nil {
		t.Errorf("expected rejection: block edge facing reference has no space at rotation %d", badRot)
	}
}

func TestPlaceBlockSucceedsAndOccupies(t *testing.T) {
	s, gd := newGameForPlacement(t)
	origin := domain.Coord{Q: 0, R: 0}
	rot := rotFacing(t, gd, "data-haven", 2)
	pb, err := PlaceBlock(s, origin, 2, gd, "data-haven", rot)
	if err != nil {
		t.Fatalf("PlaceBlock: %v", err)
	}
	want := origin.Neighbor(2)
	if pb.Coord != want {
		t.Errorf("placed at %v, want %v", pb.Coord, want)
	}
	if s.Cybernet.At(want) == nil {
		t.Error("cell not occupied after placement")
	}
	if len(s.Cybernet.Blocks) != 2 {
		t.Errorf("expected 2 blocks after placement, got %d", len(s.Cybernet.Blocks))
	}
}

func TestValidPlacementsNonEmptyFromCore(t *testing.T) {
	s, gd := newGameForPlacement(t)
	origin := domain.Coord{Q: 0, R: 0}
	// The core exposes spaces on all 6 edges, so data-haven should have several
	// legal (dir, rotation) options around it.
	opts := ValidPlacements(s.Cybernet, gd, origin, "data-haven")
	if len(opts) == 0 {
		t.Fatal("expected at least one valid placement around the Central Core")
	}
	// Every returned option must actually validate.
	for _, o := range opts {
		if err := CanPlace(s.Cybernet, gd, origin, o.Dir, "data-haven", o.Rotation); err != nil {
			t.Errorf("ValidPlacements returned an invalid option %+v: %v", o, err)
		}
	}
}

func TestOppositeAndNeighborRoundTrip(t *testing.T) {
	c := domain.Coord{Q: 3, R: -2}
	for dir := 0; dir < 6; dir++ {
		back := c.Neighbor(dir).Neighbor(domain.Opposite(dir))
		if back != c {
			t.Errorf("dir %d: neighbor then opposite gave %v, want %v", dir, back, c)
		}
	}
}
