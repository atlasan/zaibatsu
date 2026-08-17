package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Movement resolution: step budgets, activation gating, occupancy, and hex
// (block-to-block) execution. Mirrors impl/ts/src/engine/movement.ts. See
// DOCS/rules/speedrunners/board-and-movement.md ("SR-MOVE-001") and DOCS/domain-model.md.
//
// SCOPE (Phase 1): this implements pawn positions, space occupancy, the numeric
// step budget for every movement type (fixed / d6 / 2d6 / hex) including
// modifiers, activation gating (card / once-per-turn / none), and EXECUTION of
// hex movement (one whole block, ignoring spaces & space modifiers — the one
// movement type the current data can resolve correctly).
//
// Space-to-space stepping is provided by StepTargets (the space-adjacency graph:
// intra-block space.neighbors + cross-edge boundarySpaces, respecting open edges,
// rotation, and a space's direction restriction) and MoveStep (one validated,
// capacity-checked hop). Cross-edge hops activate once blocks encode
// boundarySpaces; intra-block stepping works on the current neighbours data.
// Chaining MoveStep under the resolved step budget is the remaining wiring.

// movementUsedKey namespaces a pawn's once-per-turn movement marker.
func movementUsedKey(pawnID string) string { return "move:" + pawnID }

// ResolveSteps computes how many movement steps one activation of the given
// movement attribute yields. Dice types draw from the seeded RNG (deterministic
// and parity-matched). extraSteps folds in cumulative movement modifiers (from
// cards / spaces — not yet sourced automatically). For hex, a "step" is one
// block. The result is clamped at zero.
func ResolveSteps(m domain.Movement, rng *domain.RNG, extraSteps int) int {
	base := 0
	switch m.Type {
	case "steps":
		base = m.Steps
	case "d6":
		base = rng.Intn(6) + 1
	case "2d6":
		base = (rng.Intn(6) + 1) + (rng.Intn(6) + 1)
	case "hex":
		base = 1
	}
	total := base + extraSteps
	if total < 0 {
		total = 0
	}
	return total
}

// CanActivateMovement reports whether the player may activate the pawn's movement
// now. It does not consume anything; MoveHex records the once-per-turn marker.
func CanActivateMovement(p *domain.Player, pawn *domain.Pawn) error {
	switch pawn.Movement.Activation {
	case "none":
		return fmt.Errorf("pawn %q cannot activate movement", pawn.ID)
	case "card":
		return nil // a card must be played; the caller supplies it
	case "once-per-turn":
		if p.OncePerTurnUsed[movementUsedKey(pawn.ID)] {
			return fmt.Errorf("pawn %q already used its once-per-turn movement this turn", pawn.ID)
		}
		return nil
	default:
		return fmt.Errorf("pawn %q has unknown movement activation %q", pawn.ID, pawn.Movement.Activation)
	}
}

// SpaceCapacityAt returns the pawn capacity of a space in the Cybernet.
func SpaceCapacityAt(gd *domain.GameData, coord domain.Coord, spaceID string, cy *domain.Cybernet) (int, error) {
	pb := cy.At(coord)
	if pb == nil {
		return 0, fmt.Errorf("no block at %v", coord)
	}
	block, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return 0, fmt.Errorf("unknown block %q", pb.BlockID)
	}
	sp := block.Space(spaceID)
	if sp == nil {
		return 0, fmt.Errorf("block %q has no space %q", pb.BlockID, spaceID)
	}
	return domain.SpaceCapacityFor(sp), nil
}

// CanEndOn reports whether movingPawnID may finish a move on the given space
// (capacity permitting; the moving pawn does not count against itself).
func CanEndOn(gd *domain.GameData, cy *domain.Cybernet, coord domain.Coord, spaceID, movingPawnID string) error {
	cap, err := SpaceCapacityAt(gd, coord, spaceID, cy)
	if err != nil {
		return err
	}
	if cap == domain.Unlimited {
		return nil
	}
	occ := 0
	for _, p := range cy.SpaceOccupants(coord, spaceID) {
		if p.PawnID != movingPawnID {
			occ++
		}
	}
	if occ >= cap {
		return fmt.Errorf("space %q at %v is full (%d/%d)", spaceID, coord, occ, cap)
	}
	return nil
}

// firstOpenSpace returns the first space on the block at coord that movingPawnID
// could end on, or "" if none is available.
func firstOpenSpace(gd *domain.GameData, cy *domain.Cybernet, coord domain.Coord, movingPawnID string) string {
	pb := cy.At(coord)
	if pb == nil {
		return ""
	}
	block, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return ""
	}
	for _, sp := range block.Spaces {
		if CanEndOn(gd, cy, coord, sp.ID, movingPawnID) == nil {
			return sp.ID
		}
	}
	return ""
}

// SpaceRef names a gameplay space: the block cell it sits in plus the space id.
type SpaceRef struct {
	Coord   domain.Coord
	SpaceID string
}

func sliceHas(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// StepTargets lists the spaces a pawn on (coord, spaceID) may step to in one
// step: intra-block neighbours (from space.neighbors), plus cross-edge boundary
// hops into an adjacent block when both blocks encode boundarySpaces and the edge
// is open. A space's `direction`, when set, restricts its cross-edge exit to that
// single edge (the printed direction arrow). Order is deterministic.
func StepTargets(gd *domain.GameData, cy *domain.Cybernet, coord domain.Coord, spaceID string) []SpaceRef {
	pb := cy.At(coord)
	if pb == nil {
		return nil
	}
	block, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return nil
	}
	sp := block.Space(spaceID)
	if sp == nil {
		return nil
	}
	var out []SpaceRef
	for _, nb := range sp.Neighbors {
		if block.Space(nb) != nil {
			out = append(out, SpaceRef{coord, nb})
		}
	}
	// Cross-edge hops. boundarySpaces and space.direction are indexed by the
	// block's LOCAL edge; a local edge e faces grid direction (e + rotation) % 6.
	if len(block.BoundarySpaces) == 6 && len(block.Edges) == 6 {
		for e := 0; e < 6; e++ {
			if !block.Edges[e] || !sliceHas(block.BoundarySpaces[e], spaceID) {
				continue
			}
			if sp.Direction != nil && *sp.Direction != e {
				continue // the printed arrow restricts exit to this local edge only
			}
			gridDir := (e + pb.Rotation) % 6
			ncoord := coord.Neighbor(gridDir)
			npb := cy.At(ncoord)
			if npb == nil {
				continue
			}
			nblock, ok := gd.BlockByID(npb.BlockID)
			if !ok || len(nblock.BoundarySpaces) != 6 || len(nblock.Edges) != 6 {
				continue
			}
			ne := ((domain.Opposite(gridDir)-npb.Rotation)%6 + 6) % 6 // neighbour's local edge facing back
			if !nblock.Edges[ne] {
				continue
			}
			for _, nsid := range nblock.BoundarySpaces[ne] {
				out = append(out, SpaceRef{ncoord, nsid})
			}
		}
	}
	return out
}

// MoveStep moves a pawn one step to an adjacent space, validating that the target
// is reachable (StepTargets) and has capacity (CanEndOn). It is the primitive the
// step/d6/2d6 budget layer chains; it does no activation gating itself.
func MoveStep(s *domain.GameState, gd *domain.GameData, pawnID string, target domain.Coord, targetSpaceID string) (*domain.PawnOnBoard, error) {
	pob := s.Cybernet.PawnByID(pawnID)
	if pob == nil {
		return nil, fmt.Errorf("pawn %q is not on the board", pawnID)
	}
	reachable := false
	for _, t := range StepTargets(gd, s.Cybernet, pob.Coord, pob.SpaceID) {
		if t.Coord == target && t.SpaceID == targetSpaceID {
			reachable = true
			break
		}
	}
	if !reachable {
		return nil, fmt.Errorf("space %q at %v is not adjacent to pawn %q's space", targetSpaceID, target, pawnID)
	}
	if err := CanEndOn(gd, s.Cybernet, target, targetSpaceID, pawnID); err != nil {
		return nil, err
	}
	pob.Coord = target
	pob.SpaceID = targetSpaceID
	return pob, nil
}

// MoveHex executes one block of hex movement for the pawn in grid direction dir.
// Hex movement ignores spaces and space modifiers, so it does not require a
// spaced-edge connection — only that a placed block exists in the target cell
// with room for the pawn to land. It records the once-per-turn marker when the
// pawn's movement is a once-per-turn free action.
func MoveHex(s *domain.GameState, gd *domain.GameData, pawnID string, dir int) (*domain.PawnOnBoard, error) {
	if dir < 0 || dir > 5 {
		return nil, fmt.Errorf("direction %d out of range 0..5", dir)
	}
	pob := s.Cybernet.PawnByID(pawnID)
	if pob == nil {
		return nil, fmt.Errorf("pawn %q is not on the board", pawnID)
	}
	pawn, ok := gd.PawnByID(pawnID)
	if !ok {
		return nil, fmt.Errorf("unknown pawn %q", pawnID)
	}
	if pawn.Movement.Type != "hex" {
		return nil, fmt.Errorf("pawn %q does not have hex movement", pawnID)
	}

	owner := s.PlayerByID(pob.OwnerID)
	if owner == nil {
		return nil, fmt.Errorf("pawn %q has no controlling player", pawnID)
	}
	if err := CanActivateMovement(owner, pawn); err != nil {
		return nil, err
	}

	target := pob.Coord.Neighbor(dir)
	if s.Cybernet.At(target) == nil {
		return nil, fmt.Errorf("no block at %v to move onto", target)
	}
	landing := firstOpenSpace(gd, s.Cybernet, target, pawnID)
	if landing == "" {
		return nil, fmt.Errorf("no open space to land on at %v", target)
	}

	pob.Coord = target
	pob.SpaceID = landing
	if pawn.Movement.Activation == "once-per-turn" {
		owner.OncePerTurnUsed[movementUsedKey(pawnID)] = true
	}
	return pob, nil
}
