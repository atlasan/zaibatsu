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

func TestIceFacesFor(t *testing.T) {
	// Authored exact faces win over the category derivation...
	if got := iceFacesFor([]int{2, 3}, domain.IceLow); len(got) != 2 || got[0] != 2 || got[1] != 3 {
		t.Errorf("authored faces should win, got %v", got)
	}
	// ...and empty faces fall back to the category.
	if got := iceFacesFor(nil, domain.IceHigh); len(got) != 1 || got[0] != 6 {
		t.Errorf("nil faces should fall back to category, got %v", got)
	}
	if got := iceFacesFor([]int{}, domain.IceNone); got != nil {
		t.Errorf("empty faces + none should be nil, got %v", got)
	}
}

func TestIcebreakUsesAuthoredIceFaces(t *testing.T) {
	// A block with no category but explicit all-hitting faces always breaks,
	// proving IcebreakBlock reads the authored faces rather than the category.
	s, gd, attacker, coord := icebreakScenario(t, "data-haven")
	bd, _ := gd.BlockByID(s.Cybernet.At(coord).BlockID)
	bd.IceValue = domain.IceNone
	bd.IceFaces = []int{1, 2, 3, 4, 5, 6}
	res, err := IcebreakBlock(s, gd, attacker, coord, 0)
	if err != nil {
		t.Fatalf("IcebreakBlock: %v", err)
	}
	if !res.Success {
		t.Errorf("authored all-faces ICE should always succeed, roll=%v", res.Roll)
	}
}

func TestIcebreakBlackIceEliminatesAttacker(t *testing.T) {
	// Find a seed whose roll fails against high ICE (faces [6]); with BlackIce set
	// the failed attempt must eliminate the attacker.
	for seed := uint64(1); seed <= 60; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
			t.Fatalf("place: %v", err)
		}
		coord := origin.Neighbor(0)
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
		bd, _ := gd.BlockByID("data-haven")
		bd.IceValue = domain.IceHigh
		bd.BlackIce = true
		res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
		if err != nil {
			t.Fatalf("IcebreakBlock: %v", err)
		}
		if !res.Success {
			if !res.AttackerEliminated {
				t.Fatalf("failed Icebreak vs Black ICE must eliminate the attacker (seed %d)", seed)
			}
			return
		}
	}
	t.Skip("no failing seed found in range")
}

func TestBlockAttachmentAddsIceFaces(t *testing.T) {
	gd := loadOrSkip(t)
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "block-ice-mod", Name: "Block ICE Mod", Attach: &domain.Attach{As: "block", IceModifier: &domain.IceModifier{Faces: []int{1, 2, 3, 4, 5, 6}}}})
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
		t.Fatalf("place: %v", err)
	}
	coord := origin.Neighbor(0)
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	bd, _ := gd.BlockByID("data-haven")
	bd.IceValue = domain.IceNone
	s.Cybernet.At(coord).Attachments = []domain.Attachment{{CardID: "block-ice-mod"}}
	res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
	if err != nil {
		t.Fatalf("IcebreakBlock: %v", err)
	}
	if !res.Success {
		t.Fatalf("attachment-added ICE faces should allow success, roll=%v", res.Roll)
	}
}

func TestPawnAttachmentAddsBlackIce(t *testing.T) {
	for seed := uint64(1); seed <= 60; seed++ {
		gd := loadOrSkip(t)
		gd.Cards = append(gd.Cards, domain.ActionCard{ID: "pawn-black-ice", Name: "Pawn Black ICE", Attach: &domain.Attach{As: "enemy", Slot: "add-on", IceModifier: &domain.IceModifier{Black: true}}})
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p2", Coord: origin, SpaceID: "core",
			Attachments: []domain.Attachment{{CardID: "pawn-black-ice", Slot: "add-on"}}})
		res, err := IcebreakPawn(s, gd, "speedrunner-red", "drone-turret", 0)
		if err != nil {
			t.Fatalf("IcebreakPawn: %v", err)
		}
		if !res.Success {
			if !res.AttackerEliminated {
				t.Fatalf("failed Icebreak vs attachment-added Black ICE must eliminate attacker (seed %d)", seed)
			}
			if s.Cybernet.PawnByID("speedrunner-red") != nil {
				t.Fatalf("attacker should be eliminated after failed Black ICE attempt (seed %d)", seed)
			}
			return
		}
	}
	t.Fatal("no failing seed found in range")
}

func TestIcebreakGrantedByAttachment(t *testing.T) {
	// A pawn with no innate Icebreaker gains it from an attached add-on, so the
	// Icebreak is allowed (err nil regardless of the roll outcome).
	s, gd, atk, coord := icebreakScenario(t, "data-haven")
	pawn, _ := gd.PawnByID(atk)
	pawn.Abilities = nil // strip innate abilities
	gd.Cards[0].Attach = &domain.Attach{As: "pawn", Slot: "add-on", Grants: []string{"icebreaker"}}
	pob := s.Cybernet.PawnByID(atk)
	pob.Attachments = []domain.Attachment{{CardID: gd.Cards[0].ID, Slot: "add-on"}}
	if _, err := IcebreakBlock(s, gd, atk, coord, 0); err != nil {
		t.Fatalf("granted Icebreaker should let the pawn Icebreak, got: %v", err)
	}
}

func TestIcebreakRemovedByAttachment(t *testing.T) {
	// A pawn with innate Icebreaker (speedrunner) loses it to an add-on that
	// removes it, so the Icebreak is rejected.
	s, gd, atk, coord := icebreakScenario(t, "data-haven")
	gd.Cards[0].Attach = &domain.Attach{As: "pawn", Slot: "add-on", Removes: []string{"icebreaker"}}
	pob := s.Cybernet.PawnByID(atk)
	pob.Attachments = []domain.Attachment{{CardID: gd.Cards[0].ID, Slot: "add-on"}}
	if _, err := IcebreakBlock(s, gd, atk, coord, 0); err == nil {
		t.Fatal("removed Icebreaker should prevent the Icebreak")
	}
}
