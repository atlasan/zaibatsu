package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// TestApplyDispatch drives several action kinds through the unified Apply reducer
// and checks each reaches its resolver.
func TestApplyDispatch(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}

	// Search via action: place the top-of-pile block next to the searching pawn.
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.BlockPile = []string{"data-haven"}
	dir := 2
	rot := rotFacing(t, gd, "data-haven", dir)
	if err := Apply(s, gd, Action{Type: ActSearch, PlayerID: "p1", PawnID: "speedrunner-red", Dir: dir, Rotation: rot}); err != nil {
		t.Fatalf("ActSearch: %v", err)
	}
	if s.Cybernet.At(origin.Neighbor(dir)) == nil {
		t.Error("ActSearch did not place a block")
	}

	// Delete via action against a co-located enemy.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	if err := Apply(s, gd, Action{Type: ActDelete, PawnID: "speedrunner-red", TargetID: "speedrunner-yellow"}); err != nil {
		t.Fatalf("ActDelete: %v", err)
	}

	// Unknown action kind errors.
	if err := Apply(s, gd, Action{Type: "bogus"}); err == nil {
		t.Error("expected error for unknown action kind")
	}

	// Coord-requiring action without a coord errors.
	if err := Apply(s, gd, Action{Type: ActIcebreakBlk, PawnID: "speedrunner-red"}); err == nil {
		t.Error("expected error: icebreak-block without a coord")
	}
}

// TestApplyMoveHexThroughAction moves a hex pawn one block via an action.
func TestApplyMoveHexThroughAction(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	dir := 2
	if _, err := PlaceBlock(s, origin, dir, gd, "data-haven", rotFacing(t, gd, "data-haven", dir)); err != nil {
		t.Fatalf("place: %v", err)
	}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	if err := Apply(s, gd, Action{Type: ActMoveHex, PawnID: "speedrunner-yellow", Dir: dir}); err != nil {
		t.Fatalf("ActMoveHex: %v", err)
	}
	if s.Cybernet.PawnByID("speedrunner-yellow").Coord != origin.Neighbor(dir) {
		t.Error("ActMoveHex did not move the pawn")
	}
}

// TestPlayerIDDefaultsToCurrent confirms an empty PlayerID resolves to the
// current player (place-marker on the current player).
func TestPlayerIDDefaultsToCurrent(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	before := s.CurrentPlayerPtr().ControlMarkersPlaced
	if err := Apply(s, gd, Action{Type: ActPlaceMarker}); err != nil {
		t.Fatalf("ActPlaceMarker: %v", err)
	}
	if s.Players[0].ControlMarkersPlaced != before+1 {
		t.Error("place-marker with empty PlayerID should target the current player")
	}
}
