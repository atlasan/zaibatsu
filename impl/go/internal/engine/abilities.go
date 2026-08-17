package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// The remaining two core abilities: Search (place a block from the pile) and
// Reboot (re-enter an eliminated pawn at the Central Core). Mirrors
// impl/ts/src/engine/abilities.ts. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md ("SR-ABILITY-002
// ability", "Reboot ability"). Backlog: T-104.
//
// Search draws the TOP of the block pile (the player does not choose which block,
// only where/orientation) and places it per the placement rules. Reboot returns
// an eliminated pawn to the Central Core under the rebooting player's control.
// Card-cost consumption (Search discards 1 card; Reboot discards 4) is handled by
// the later card-use-resolution task; these functions resolve the ability effect.

// SearchTopBlock returns the id of the block currently on top of the pile, or "".
func SearchTopBlock(s *domain.GameState) string {
	if len(s.BlockPile) == 0 {
		return ""
	}
	return s.BlockPile[len(s.BlockPile)-1]
}

// ValidSearchPlacements lists legal (dir, rotation) options for placing the
// top-of-pile block around the searching pawn's block.
func ValidSearchPlacements(s *domain.GameState, gd *domain.GameData, pawnID string) ([]Placement, error) {
	pob := s.Cybernet.PawnByID(pawnID)
	if pob == nil {
		return nil, fmt.Errorf("pawn %q is not on the board", pawnID)
	}
	top := SearchTopBlock(s)
	if top == "" {
		return nil, fmt.Errorf("no blocks left in the pile")
	}
	return ValidPlacements(s.Cybernet, gd, pob.Coord, top), nil
}

// Search activates a pawn's Search ability: draw the top block of the pile and
// place it adjacent to the pawn's block in the chosen direction/rotation. The
// block is only consumed if the placement is legal, so a rejected attempt leaves
// the pile intact for a retry.
func Search(s *domain.GameState, gd *domain.GameData, pawnID string, dir, rot int) (*domain.PlacedBlock, error) {
	pob := s.Cybernet.PawnByID(pawnID)
	if pob == nil {
		return nil, fmt.Errorf("pawn %q is not on the board", pawnID)
	}
	actor, ok := gd.PawnByID(pawnID)
	if !ok {
		return nil, fmt.Errorf("unknown pawn %q", pawnID)
	}
	ability := findAbility(actor, "search")
	if ability == nil || ability.Activation == "none" {
		return nil, fmt.Errorf("pawn %q cannot activate Search", pawnID)
	}
	owner := s.PlayerByID(pob.OwnerID)
	if owner == nil {
		return nil, fmt.Errorf("pawn %q has no controlling player", pawnID)
	}
	key := abilityUsedKey("search", pawnID)
	if ability.Activation == "once-per-turn" && owner.OncePerTurnUsed[key] {
		return nil, fmt.Errorf("pawn %q already used its once-per-turn Search this turn", pawnID)
	}
	if len(s.BlockPile) == 0 {
		return nil, fmt.Errorf("no blocks left in the pile")
	}
	blockID := s.BlockPile[len(s.BlockPile)-1]

	// Validate before consuming the block so a failed attempt is retryable.
	if err := CanPlace(s.Cybernet, gd, pob.Coord, dir, blockID, rot); err != nil {
		return nil, err
	}
	s.BlockPile = s.BlockPile[:len(s.BlockPile)-1]
	pb, err := PlaceBlock(s, pob.Coord, dir, gd, blockID, rot)
	if err != nil {
		return nil, err
	}
	if ability.Activation == "once-per-turn" {
		owner.OncePerTurnUsed[key] = true
	}
	return pb, nil
}

// centralCorePlacement returns the placed Central Core's coordinate and landing
// space id.
func centralCorePlacement(s *domain.GameState, gd *domain.GameData) (domain.Coord, string, error) {
	for _, pb := range s.Cybernet.Blocks {
		if bd, ok := gd.BlockByID(pb.BlockID); ok && bd.IsCentralCore {
			space := ""
			if len(bd.Spaces) > 0 {
				space = bd.Spaces[0].ID
			}
			return pb.Coord, space, nil
		}
	}
	return domain.Coord{}, "", fmt.Errorf("no Central Core in the Cybernet")
}

// Reboot re-enters an eliminated pawn at the Central Core under playerID's
// control. The pawn must have the Reboot ability and be in the Eliminated pool.
func Reboot(s *domain.GameState, gd *domain.GameData, pawnID, playerID string) (*domain.PawnOnBoard, error) {
	idx := -1
	for i, id := range s.Eliminated {
		if id == pawnID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, fmt.Errorf("pawn %q is not eliminated", pawnID)
	}
	actor, ok := gd.PawnByID(pawnID)
	if !ok {
		return nil, fmt.Errorf("unknown pawn %q", pawnID)
	}
	ability := findAbility(actor, "reboot")
	if ability == nil || ability.Activation == "none" {
		return nil, fmt.Errorf("pawn %q cannot activate Reboot", pawnID)
	}
	owner := s.PlayerByID(playerID)
	if owner == nil {
		return nil, fmt.Errorf("unknown player %q", playerID)
	}
	key := abilityUsedKey("reboot", pawnID)
	if ability.Activation == "once-per-turn" && owner.OncePerTurnUsed[key] {
		return nil, fmt.Errorf("pawn %q already used its once-per-turn Reboot this turn", pawnID)
	}
	coord, space, err := centralCorePlacement(s, gd)
	if err != nil {
		return nil, err
	}
	pob := &domain.PawnOnBoard{PawnID: pawnID, OwnerID: playerID, Coord: coord, SpaceID: space}
	s.Cybernet.PlacePawn(pob)
	s.Eliminated = append(s.Eliminated[:idx], s.Eliminated[idx+1:]...)
	if ability.Activation == "once-per-turn" {
		owner.OncePerTurnUsed[key] = true
	}
	return pob, nil
}
