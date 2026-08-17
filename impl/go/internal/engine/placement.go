package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Block placement in the Cybernet (the Search ability's effect). Mirrors
// impl/ts/src/engine/placement.ts. See DOCS/rules/speedrunners/board-and-movement.md ("SR-BOARD-002
// block") and DOCS/domain-model.md.
//
// Placement rules (Speedrunners p.15), applied relative to a reference block
// (the block the searching pawn occupies):
//   1. The target cell must be empty and adjacent to the reference block.
//   2. The reference block's edge facing the target must expose a space.
//   3. The new block, at the chosen rotation, must expose a space on the edge
//      facing the reference block.
//
// Interpretation: the base rules only require a spaced connection to the
// reference block. We do NOT additionally constrain the new block against other
// incidental neighbors (the rulebook does not). Documented in DOCS/domain-model.md.

// Placement is one legal way to place a block: a direction from the reference
// block plus a rotation for the new block.
type Placement struct {
	Dir      int `json:"dir"`
	Rotation int `json:"rotation"`
}

// edgeHasSpace reports whether the given placed-block orientation exposes a space
// on the edge facing grid direction gridDir. A block's local edge e faces
// direction (e + rotation) mod 6, so the local edge on gridDir is
// (gridDir - rotation) mod 6.
func edgeHasSpace(b *domain.Block, rotation, gridDir int) bool {
	if len(b.Edges) != 6 {
		return false
	}
	local := ((gridDir-rotation)%6 + 6) % 6
	return b.Edges[local]
}

// EdgeHasSpace is the exported form used by callers/tests.
func EdgeHasSpace(b *domain.Block, rotation, gridDir int) bool {
	return edgeHasSpace(b, rotation, gridDir)
}

// CanPlace validates placing blockID at rotation rot in direction dir from the
// reference block at refCoord. Returns nil if legal, else a descriptive error.
func CanPlace(cy *domain.Cybernet, gd *domain.GameData, refCoord domain.Coord, dir int, blockID string, rot int) error {
	if dir < 0 || dir > 5 {
		return fmt.Errorf("direction %d out of range 0..5", dir)
	}
	if rot < 0 || rot > 5 {
		return fmt.Errorf("rotation %d out of range 0..5", rot)
	}
	ref := cy.At(refCoord)
	if ref == nil {
		return fmt.Errorf("no reference block at %v", refCoord)
	}
	target := refCoord.Neighbor(dir)
	if cy.Occupied(target) {
		return fmt.Errorf("target cell %v is already occupied", target)
	}
	refBlock, ok := gd.BlockByID(ref.BlockID)
	if !ok {
		return fmt.Errorf("unknown reference block %q", ref.BlockID)
	}
	newBlock, ok := gd.BlockByID(blockID)
	if !ok {
		return fmt.Errorf("unknown block %q", blockID)
	}
	if !edgeHasSpace(refBlock, ref.Rotation, dir) {
		return fmt.Errorf("reference block %q has no connecting space on the facing side", ref.BlockID)
	}
	if !edgeHasSpace(newBlock, rot, domain.Opposite(dir)) {
		return fmt.Errorf("block %q at rotation %d has no connecting space facing the reference", blockID, rot)
	}
	return nil
}

// PlaceBlock validates and places blockID into the Cybernet. On success the block
// instance is added; callers are responsible for having drawn the block id from
// the block pile (see Search wiring, a later backlog item).
func PlaceBlock(s *domain.GameState, refCoord domain.Coord, dir int, gd *domain.GameData, blockID string, rot int) (*domain.PlacedBlock, error) {
	if err := CanPlace(s.Cybernet, gd, refCoord, dir, blockID, rot); err != nil {
		return nil, err
	}
	pb := &domain.PlacedBlock{
		BlockID:  blockID,
		Rotation: rot,
		Coord:    refCoord.Neighbor(dir),
	}
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, pb)
	return pb, nil
}

// ValidPlacements returns every legal (dir, rotation) for placing blockID
// adjacent to the reference block at refCoord.
func ValidPlacements(cy *domain.Cybernet, gd *domain.GameData, refCoord domain.Coord, blockID string) []Placement {
	var out []Placement
	for dir := 0; dir < 6; dir++ {
		for rot := 0; rot < 6; rot++ {
			if CanPlace(cy, gd, refCoord, dir, blockID, rot) == nil {
				out = append(out, Placement{Dir: dir, Rotation: rot})
			}
		}
	}
	return out
}
