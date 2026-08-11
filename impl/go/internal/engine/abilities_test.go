package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// searchGame returns a fresh game with speedrunner-red (has Search) on the core
// and a deterministic block pile.
func searchGame(t *testing.T, pile ...string) (*domain.GameState, *domain.GameData) {
	t.Helper()
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: domain.Coord{Q: 0, R: 0}, SpaceID: "core"})
	s.BlockPile = append([]string{}, pile...)
	return s, gd
}

func TestSearchPlacesTopBlock(t *testing.T) {
	s, gd := searchGame(t, "data-haven")
	origin := domain.Coord{Q: 0, R: 0}
	dir := 2
	rot := rotFacing(t, gd, "data-haven", dir)
	pb, err := Search(s, gd, "speedrunner-red", dir, rot)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if pb.BlockID != "data-haven" {
		t.Errorf("placed %q, want data-haven", pb.BlockID)
	}
	if pb.Coord != origin.Neighbor(dir) {
		t.Errorf("placed at %v, want %v", pb.Coord, origin.Neighbor(dir))
	}
	if len(s.BlockPile) != 0 {
		t.Errorf("pile should be empty after search, got %d", len(s.BlockPile))
	}
	if s.Cybernet.At(origin.Neighbor(dir)) == nil {
		t.Error("cell not occupied after search")
	}
}

func TestSearchInvalidPlacementDoesNotConsume(t *testing.T) {
	s, gd := searchGame(t, "data-haven")
	// data-haven edges [T,F,T,T,F,T]; find a rotation whose edge facing back on
	// dir 0 is FALSE so placement is rejected.
	b, _ := gd.BlockByID("data-haven")
	badRot := -1
	for rot := 0; rot < 6; rot++ {
		if !EdgeHasSpace(b, rot, domain.Opposite(0)) {
			badRot = rot
			break
		}
	}
	if badRot < 0 {
		t.Skip("no unconnected rotation")
	}
	if _, err := Search(s, gd, "speedrunner-red", 0, badRot); err == nil {
		t.Error("expected rejection for unconnected orientation")
	}
	if len(s.BlockPile) != 1 {
		t.Errorf("failed search must not consume the block; pile = %d", len(s.BlockPile))
	}
}

func TestSearchEmptyPile(t *testing.T) {
	s, gd := searchGame(t) // empty pile
	if _, err := Search(s, gd, "speedrunner-red", 0, 0); err == nil {
		t.Error("expected error searching with an empty pile")
	}
}

func TestSearchRequiresSearchAbility(t *testing.T) {
	s, gd := searchGame(t, "data-haven")
	// drone-turret has no Search ability.
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: domain.Coord{Q: 0, R: 0}, SpaceID: "core"})
	if _, err := Search(s, gd, "drone-turret", 0, 0); err == nil {
		t.Error("expected error: drone-turret cannot Search")
	}
}

func TestValidSearchPlacements(t *testing.T) {
	s, gd := searchGame(t, "data-haven")
	opts, err := ValidSearchPlacements(s, gd, "speedrunner-red")
	if err != nil {
		t.Fatalf("ValidSearchPlacements: %v", err)
	}
	if len(opts) == 0 {
		t.Fatal("expected valid placements around the core")
	}
	for _, o := range opts {
		if err := CanPlace(s.Cybernet, gd, domain.Coord{Q: 0, R: 0}, o.Dir, "data-haven", o.Rotation); err != nil {
			t.Errorf("returned invalid option %+v: %v", o, err)
		}
	}
}

func TestRebootReturnsPawnToCore(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	// speedrunner-red has the Reboot ability; mark it eliminated.
	s.Cybernet.RemovePawn("speedrunner-red") // no-op if absent
	s.Eliminated = []string{"speedrunner-red"}
	pob, err := Reboot(s, gd, "speedrunner-red", "p1")
	if err != nil {
		t.Fatalf("Reboot: %v", err)
	}
	if pob.Coord != origin {
		t.Errorf("rebooted at %v, want Central Core %v", pob.Coord, origin)
	}
	if pob.OwnerID != "p1" {
		t.Errorf("rebooted owner %q, want p1", pob.OwnerID)
	}
	if s.Cybernet.PawnByID("speedrunner-red") == nil {
		t.Error("rebooted pawn should be on the board")
	}
	if len(s.Eliminated) != 0 {
		t.Errorf("Eliminated pool should be empty, got %v", s.Eliminated)
	}
}

func TestRebootRejectsNonEliminated(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	if _, err := Reboot(s, gd, "speedrunner-red", "p1"); err == nil {
		t.Error("expected error rebooting a pawn that is not eliminated")
	}
}

func TestRebootRequiresRebootAbility(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	// drone-turret has no Reboot ability.
	s.Eliminated = []string{"drone-turret"}
	if _, err := Reboot(s, gd, "drone-turret", "p1"); err == nil {
		t.Error("expected error: drone-turret cannot Reboot")
	}
}
