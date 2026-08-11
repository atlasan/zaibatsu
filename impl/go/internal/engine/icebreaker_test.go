package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func TestIceFaces(t *testing.T) {
	if got := IceFaces(domain.IceNone); got != nil {
		t.Errorf("none should have no faces, got %v", got)
	}
	if got := len(IceFaces(domain.IceLow)); got != 3 {
		t.Errorf("low should have 3 faces, got %d", got)
	}
	if got := len(IceFaces(domain.IceMedium)); got != 2 {
		t.Errorf("medium should have 2 faces, got %d", got)
	}
	if got := len(IceFaces(domain.IceHigh)); got != 1 {
		t.Errorf("high should have 1 face, got %d", got)
	}
	if got := len(IceFaces(domain.IceBlack)); got != 1 {
		t.Errorf("black should have 1 face, got %d", got)
	}
}

// icebreakScenario places a block adjacent to the core and puts a controlled
// icebreaker pawn (a speedrunner) on that block. Returns state, data, the
// attacker id (owned by p1), and the block coord.
func icebreakScenario(t *testing.T, blockID string) (*domain.GameState, *domain.GameData, string, domain.Coord) {
	t.Helper()
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	dir := 0
	if _, err := PlaceBlock(s, origin, dir, gd, blockID, rotFacing(t, gd, blockID, dir)); err != nil {
		t.Fatalf("place block: %v", err)
	}
	coord := origin.Neighbor(dir)
	// A speedrunner has the icebreaker ability (card-activated).
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	return s, gd, "speedrunner-red", coord
}

func TestIcebreakBlockGainsControlAndPlacesMarker(t *testing.T) {
	// Find a seed that succeeds against low ICE (3/6 per die) to assert the
	// control-gain path deterministically.
	found := false
	for seed := uint64(1); seed <= 60 && !found; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
			t.Fatalf("place: %v", err)
		}
		coord := origin.Neighbor(0)
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
		before := s.PlayerByID("p1").ControlMarkersPlaced
		res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
		if err != nil {
			t.Fatalf("IcebreakBlock: %v", err)
		}
		if res.Success {
			found = true
			pb := s.Cybernet.At(coord)
			if pb.OwnerID != "p1" {
				t.Errorf("block owner = %q, want p1", pb.OwnerID)
			}
			if got := s.PlayerByID("p1").ControlMarkersPlaced; got != before+1 {
				t.Errorf("markers placed = %d, want %d", got, before+1)
			}
		}
	}
	if !found {
		t.Fatal("expected some seed in 1..60 to succeed against low ICE")
	}
}

func TestIcebreakBlockRejectsNoIce(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	// Put the attacker on the Central Core (ICE none).
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	if _, err := IcebreakBlock(s, gd, "speedrunner-red", origin, 0); err == nil {
		t.Error("expected error Icebreaking the ICE-less Central Core")
	}
}

func TestIcebreakBlockRejectsAlreadyControlled(t *testing.T) {
	s, gd, attacker, coord := icebreakScenario(t, "data-haven")
	s.Cybernet.At(coord).OwnerID = "p1" // already ours
	if _, err := IcebreakBlock(s, gd, attacker, coord, 0); err == nil {
		t.Error("expected error Icebreaking a block we already control")
	}
}

func TestIcebreakBlockStealReturnsPreviousMarker(t *testing.T) {
	found := false
	for seed := uint64(1); seed <= 60 && !found; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
			t.Fatalf("place: %v", err)
		}
		coord := origin.Neighbor(0)
		// p2 already controls the block with one placed marker.
		pb := s.Cybernet.At(coord)
		pb.OwnerID = "p2"
		p2 := s.PlayerByID("p2")
		p2.ControlMarkersPlaced = 1
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
		res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
		if err != nil {
			t.Fatalf("IcebreakBlock: %v", err)
		}
		if res.Success {
			found = true
			if pb.OwnerID != "p1" {
				t.Errorf("block should now be p1's, got %q", pb.OwnerID)
			}
			if p2.ControlMarkersPlaced != 0 {
				t.Errorf("p2 marker should have returned, placed = %d", p2.ControlMarkersPlaced)
			}
			if s.PlayerByID("p1").ControlMarkersPlaced != 1 {
				t.Errorf("p1 should have placed one marker, got %d", s.PlayerByID("p1").ControlMarkersPlaced)
			}
		}
	}
	if !found {
		t.Fatal("expected some seed to succeed at stealing")
	}
}

func TestIcebreakBlackIceEliminatesAttackerOnFail(t *testing.T) {
	// server-farm has black ICE (faces {6}); most seeds miss, eliminating the
	// attacker. Find a failing seed to assert the elimination path.
	found := false
	for seed := uint64(1); seed <= 60 && !found; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		if _, err := PlaceBlock(s, origin, 0, gd, "server-farm", rotFacing(t, gd, "server-farm", 0)); err != nil {
			t.Fatalf("place: %v", err)
		}
		coord := origin.Neighbor(0)
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
		res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
		if err != nil {
			t.Fatalf("IcebreakBlock: %v", err)
		}
		if !res.Success {
			found = true
			if !res.AttackerEliminated {
				t.Error("failed Black ICE attempt should eliminate the attacker")
			}
			if s.Cybernet.PawnByID("speedrunner-red") != nil {
				t.Error("attacker should be off the board after Black ICE elimination")
			}
		}
	}
	if !found {
		t.Fatal("expected some seed to miss Black ICE")
	}
}

func TestIcebreakPawnChangesOwnerOnSuccess(t *testing.T) {
	found := false
	for seed := uint64(1); seed <= 80 && !found; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		// drone-turret has low ICE and is a controllable pawn.
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p2", Coord: origin, SpaceID: "core"})
		res, err := IcebreakPawn(s, gd, "speedrunner-red", "drone-turret", 0)
		if err != nil {
			t.Fatalf("IcebreakPawn: %v", err)
		}
		if res.Success {
			found = true
			if s.Cybernet.PawnByID("drone-turret").OwnerID != "p1" {
				t.Errorf("drone-turret should now be p1's")
			}
		}
	}
	if !found {
		t.Fatal("expected some seed to succeed Icebreaking the drone")
	}
}

func TestIcebreakPawnRejectsNoIceAndSelf(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 2})
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	// speedrunner-blue has no ICE value -> cannot be Icebroken.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	if _, err := IcebreakPawn(s, gd, "speedrunner-red", "speedrunner-blue", 0); err == nil {
		t.Error("expected error Icebreaking an ICE-less pawn")
	}
	if _, err := IcebreakPawn(s, gd, "speedrunner-red", "speedrunner-red", 0); err == nil {
		t.Error("expected error Icebreaking self")
	}
}

func TestIcebreakDeterministicRoll(t *testing.T) {
	run := func() []int {
		s, gd, attacker, coord := icebreakScenario(t, "data-haven")
		res, _ := IcebreakBlock(s, gd, attacker, coord, 0)
		return res.Roll
	}
	a, b := run(), run()
	if len(a) != len(b) || (len(a) > 0 && a[0] != b[0]) {
		t.Fatalf("Icebreak roll not deterministic: %v vs %v", a, b)
	}
}
