package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// cardGame sets up a game with a controllable attacker/target and a known hand.
func cardGame(t *testing.T, seed uint64) (*domain.GameState, *domain.GameData) {
	t.Helper()
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
	return s, gd
}

func TestPlayDeleteConsumesCardAndResolves(t *testing.T) {
	// move-1 activates delete/icebreaker/search/reboot in the seed data.
	origin := domain.Coord{Q: 0, R: 0}
	found := false
	for seed := uint64(1); seed <= 50 && !found; seed++ {
		s, gd := cardGame(t, seed)
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: origin, SpaceID: "core"})
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
		p1 := s.PlayerByID("p1")
		p1.Hand = []string{"move-1", "move-2"}
		discardBefore := len(s.Discard)
		res, err := PlayDelete(s, gd, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0)
		if err != nil {
			t.Fatalf("PlayDelete: %v", err)
		}
		// Card consumed regardless of hit/miss.
		if cardInHand(p1, "move-1") {
			t.Error("move-1 should have left the hand")
		}
		if len(s.Discard) != discardBefore+1 {
			t.Errorf("discard grew by %d, want 1", len(s.Discard)-discardBefore)
		}
		if res.Eliminated {
			found = true
			if s.Cybernet.PawnByID("speedrunner-yellow") != nil {
				t.Error("eliminated target should be off the board")
			}
		}
	}
	if !found {
		t.Fatal("expected an elimination in some seed")
	}
}

func TestPlayDeleteRejectsCardNotInHand(t *testing.T) {
	s, gd := cardGame(t, 1)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.PlayerByID("p1").Hand = []string{"move-2"}
	if _, err := PlayDelete(s, gd, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0); err == nil {
		t.Error("expected error: card not in hand")
	}
}

func TestPlayDeleteRejectsNonActivatingCard(t *testing.T) {
	s, gd := cardGame(t, 1)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	// enemy-malware activates only "delete" per seed... actually it does. Use a
	// card with no delete: armor-brainchip activates ["icebreaker"] only.
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"armor-brainchip"}
	if _, err := PlayDelete(s, gd, "p1", "armor-brainchip", "speedrunner-green", "speedrunner-yellow", 0); err == nil {
		t.Error("expected error: armor-brainchip cannot activate Delete")
	}
	// And the card must not have been consumed on an illegal play.
	if !cardInHand(p1, "armor-brainchip") {
		t.Error("illegal play must not consume the card")
	}
}

func TestPlayDeleteRejectsUnownedAttacker(t *testing.T) {
	s, gd := cardGame(t, 1)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	// attacker belongs to p2, but p1 tries to use it.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.PlayerByID("p1").Hand = []string{"move-1"}
	if _, err := PlayDelete(s, gd, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0); err == nil {
		t.Error("expected error: p1 cannot act with p2's pawn")
	}
}

func TestPlaySearchDiscardsCardAndPlaces(t *testing.T) {
	s, gd := cardGame(t, 1)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.BlockPile = []string{"data-haven"}
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1", "move-2"}
	dir := 2
	rot := rotFacing(t, gd, "data-haven", dir)
	pb, err := PlaySearch(s, gd, "p1", "move-1", "speedrunner-red", dir, rot)
	if err != nil {
		t.Fatalf("PlaySearch: %v", err)
	}
	if pb.BlockID != "data-haven" {
		t.Errorf("placed %q, want data-haven", pb.BlockID)
	}
	if cardInHand(p1, "move-1") {
		t.Error("move-1 should have been discarded by Search")
	}
	if len(s.BlockPile) != 0 {
		t.Errorf("pile should be empty, got %d", len(s.BlockPile))
	}
}

func TestPlayMoveUsesCardBudgetAndConsumesCard(t *testing.T) {
	s, gd := cardGame(t, 1)
	coord := domain.Coord{Q: 0, R: -1}
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "data-haven", Rotation: 0, Coord: coord})
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1"}
	moved, err := PlayMove(s, gd, "p1", "move-1", "speedrunner-red", []SpaceRef{{Coord: coord, SpaceID: "b"}})
	if err != nil {
		t.Fatalf("PlayMove: %v", err)
	}
	if moved.SpaceID != "b" {
		t.Errorf("moved to %q, want b", moved.SpaceID)
	}
	if len(p1.Hand) != 0 || len(s.Discard) == 0 || s.Discard[len(s.Discard)-1] != "move-1" {
		t.Errorf("card was not consumed: hand=%v discard=%v", p1.Hand, s.Discard)
	}
	if p1.OncePerTurnUsed[movementUsedKey("speedrunner-red")] {
		t.Error("card movement must not spend the pawn's once-per-turn movement")
	}
}

func TestPlayMoveRejectsOverBudgetWithoutConsumingCard(t *testing.T) {
	s, gd := cardGame(t, 1)
	coord := domain.Coord{Q: 0, R: -1}
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "data-haven", Rotation: 0, Coord: coord})
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1"}
	_, err := PlayMove(s, gd, "p1", "move-1", "speedrunner-red", []SpaceRef{{Coord: coord, SpaceID: "b"}, {Coord: coord, SpaceID: "a"}})
	if err == nil {
		t.Fatal("expected over-budget PlayMove rejection")
	}
	if len(p1.Hand) != 1 || p1.Hand[0] != "move-1" {
		t.Errorf("illegal move consumed card: %v", p1.Hand)
	}
}

func TestPlayRebootRequiresFourCards(t *testing.T) {
	s, gd := cardGame(t, 1)
	s.Eliminated = []string{"speedrunner-red"}
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1", "move-2", "move-3"} // only 3
	if _, err := PlayReboot(s, gd, "p1", []string{"move-1", "move-2", "move-3"}, "speedrunner-red"); err == nil {
		t.Error("expected error: Reboot needs 4 cards")
	}
}

func TestPlayRebootConsumesFourCardsAndReturnsPawn(t *testing.T) {
	s, gd := cardGame(t, 1)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.RemovePawn("speedrunner-red")
	s.Eliminated = []string{"speedrunner-red"}
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1", "move-2", "move-3", "add-on-accelerator", "weapon-gunhed"}
	discardBefore := len(s.Discard)
	cards := []string{"move-1", "move-2", "move-3", "add-on-accelerator"}
	pob, err := PlayReboot(s, gd, "p1", cards, "speedrunner-red")
	if err != nil {
		t.Fatalf("PlayReboot: %v", err)
	}
	if pob.Coord != origin || pob.OwnerID != "p1" {
		t.Errorf("rebooted pawn at %v owner %q, want core/p1", pob.Coord, pob.OwnerID)
	}
	if len(p1.Hand) != 1 || p1.Hand[0] != "weapon-gunhed" {
		t.Errorf("hand after reboot = %v, want [weapon-gunhed]", p1.Hand)
	}
	if len(s.Discard) != discardBefore+4 {
		t.Errorf("discard grew by %d, want 4", len(s.Discard)-discardBefore)
	}
	if len(s.Eliminated) != 0 {
		t.Errorf("Eliminated should be empty, got %v", s.Eliminated)
	}
}

func TestPlayRebootRejectsCardsNotHeld(t *testing.T) {
	s, gd := cardGame(t, 1)
	s.Eliminated = []string{"speedrunner-red"}
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"move-1", "move-2"}
	// Ask to discard 4 including cards not held.
	if _, err := PlayReboot(s, gd, "p1", []string{"move-1", "move-2", "move-3", "move-3"}, "speedrunner-red"); err == nil {
		t.Error("expected error: cards not held")
	}
}
