package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func attachGame(t *testing.T) (*domain.GameState, *domain.GameData) {
	t.Helper()
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	return s, gd
}

func TestAttachToPawnSuccess(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"add-on-accelerator", "move-1"} // accelerator: as pawn, slot add-on
	if err := AttachToPawn(s, gd, "p1", "add-on-accelerator", "speedrunner-red"); err != nil {
		t.Fatalf("AttachToPawn: %v", err)
	}
	pob := s.Cybernet.PawnByID("speedrunner-red")
	if !pob.HasSlotFilled("add-on") {
		t.Error("add-on slot should be filled")
	}
	if cardInHand(p1, "add-on-accelerator") {
		t.Error("card should have left the hand")
	}
	// The granted class shows up in effective classes.
	classes := EffectivePawnClasses(gd, pob)
	if !containsStr(classes, "accelerator") {
		t.Errorf("effective classes %v should include accelerator", classes)
	}
}

func TestAttachToPawnRejectsFilledSlot(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	pob := &domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core",
		Attachments: []domain.Attachment{{CardID: "x", Slot: "add-on"}}}
	s.Cybernet.PlacePawn(pob)
	s.PlayerByID("p1").Hand = []string{"add-on-accelerator"}
	if err := AttachToPawn(s, gd, "p1", "add-on-accelerator", "speedrunner-red"); err == nil {
		t.Error("expected error: add-on slot already filled")
	}
}

func TestAttachToPawnRejectsMissingSlot(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	// drone-turret only has a "module" slot, not "armor".
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.PlayerByID("p1").Hand = []string{"armor-brainchip"} // slot armor
	if err := AttachToPawn(s, gd, "p1", "armor-brainchip", "drone-turret"); err == nil {
		t.Error("expected error: drone-turret has no armor slot")
	}
}

func TestGrantedSlotAllowsFollowUpAttachment(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	gd.Cards = append(gd.Cards,
		domain.ActionCard{ID: "grant-gadget-slot", Name: "Grant Gadget Slot", Attach: &domain.Attach{As: "pawn", Slot: "module", GrantsSlot: []string{"gadget"}}},
		domain.ActionCard{ID: "follow-up-gadget", Name: "Follow Up Gadget", Attach: &domain.Attach{As: "pawn", Slot: "gadget"}},
	)
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"grant-gadget-slot", "follow-up-gadget"}
	if err := AttachToPawn(s, gd, "p1", "grant-gadget-slot", "drone-turret"); err != nil {
		t.Fatalf("grant slot attach: %v", err)
	}
	if err := AttachToPawn(s, gd, "p1", "follow-up-gadget", "drone-turret"); err != nil {
		t.Fatalf("follow-up gadget attach: %v", err)
	}
	if !s.Cybernet.PawnByID("drone-turret").HasSlotFilled("gadget") {
		t.Error("granted gadget slot should allow the second attachment")
	}
}

func TestAttachToEnemySuccessAndRejectsOwn(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.PlayerByID("p1").Hand = []string{"enemy-malware"} // as enemy, slot add-on
	if err := AttachToEnemy(s, gd, "p1", "enemy-malware", "speedrunner-red", "speedrunner-blue"); err != nil {
		t.Fatalf("AttachToEnemy: %v", err)
	}
	if !s.Cybernet.PawnByID("speedrunner-blue").HasSlotFilled("add-on") {
		t.Error("enemy add-on slot should be filled")
	}
	// Targeting your own pawn as an enemy attachment is rejected.
	s.PlayerByID("p1").Hand = []string{"enemy-malware"}
	if err := AttachToEnemy(s, gd, "p1", "enemy-malware", "speedrunner-red", "speedrunner-red"); err == nil {
		t.Error("expected error: enemy attachment on own pawn")
	}
}

func TestAttachToBlockSuccessAndNoIce(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	// A synthetic block-attachment card.
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "blk-card", Name: "Block Patch", Attach: &domain.Attach{As: "block"}})
	// Place a block with an ICE value and an actor pawn on it.
	if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
		t.Fatalf("place block: %v", err)
	}
	coord := origin.Neighbor(0)
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	s.PlayerByID("p1").Hand = []string{"blk-card"}
	if err := AttachToBlock(s, gd, "p1", "blk-card", "speedrunner-red", coord); err != nil {
		t.Fatalf("AttachToBlock: %v", err)
	}
	if len(s.Cybernet.At(coord).Attachments) != 1 {
		t.Error("block should have one attachment")
	}
	// The Central Core has no ICE value → rejected.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.PlayerByID("p1").Hand = []string{"blk-card"}
	if err := AttachToBlock(s, gd, "p1", "blk-card", "speedrunner-blue", origin); err == nil {
		t.Error("expected error: cannot attach to the ICE-less Central Core")
	}
}

func TestAttachCostPaidAndReturnedOnElimination(t *testing.T) {
	s, gd := attachGame(t)
	origin := domain.Coord{Q: 0, R: 0}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "cost-card", Name: "Pricey", Attach: &domain.Attach{As: "pawn", Slot: "gadget", Cost: 2}})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	p1 := s.PlayerByID("p1")
	p1.Hand = []string{"cost-card"}

	// Insufficient counters → rejected, nothing spent.
	p1.BonusCounters = 1
	if err := AttachToPawn(s, gd, "p1", "cost-card", "speedrunner-red"); err == nil {
		t.Fatal("expected error: cannot afford cost")
	}
	if p1.BonusCounters != 1 || !cardInHand(p1, "cost-card") {
		t.Fatal("a failed attach must not spend counters or the card")
	}

	// Enough counters → attach, counters moved onto the card.
	p1.BonusCounters = 3
	if err := AttachToPawn(s, gd, "p1", "cost-card", "speedrunner-red"); err != nil {
		t.Fatalf("AttachToPawn: %v", err)
	}
	if p1.BonusCounters != 1 {
		t.Errorf("bonus after paying cost = %d, want 1", p1.BonusCounters)
	}

	// Eliminating the pawn discards the card and returns the 2 counters.
	eliminatePawn(s, "speedrunner-red")
	if p1.BonusCounters != 3 {
		t.Errorf("bonus after elimination refund = %d, want 3", p1.BonusCounters)
	}
	if !containsStr(s.Discard, "cost-card") {
		t.Error("attached card should be in the discard pile after elimination")
	}
}

func TestTakeoverDiscardsAttachmentsAndReturnsBonus(t *testing.T) {
	found := false
	for seed := uint64(1); seed <= 80 && !found; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		origin := domain.Coord{Q: 0, R: 0}
		s.Cybernet.Pawns = []*domain.PawnOnBoard{}
		// p1 attacker; p2 owns drone-turret (low ICE, controllable) with a paid attachment.
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
		p2 := s.PlayerByID("p2")
		p2.BonusCounters = 0
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p2", Coord: origin, SpaceID: "core",
			Attachments: []domain.Attachment{{CardID: "some-card", Slot: "module", BonusPaid: 1}}})
		res, err := IcebreakPawn(s, gd, "speedrunner-red", "drone-turret", 0)
		if err != nil {
			t.Fatalf("IcebreakPawn: %v", err)
		}
		if res.Success {
			found = true
			dt := s.Cybernet.PawnByID("drone-turret")
			if dt.OwnerID != "p1" {
				t.Error("drone should now be p1's")
			}
			if len(dt.Attachments) != 0 {
				t.Error("attachments should be discarded on takeover")
			}
			if p2.BonusCounters != 1 {
				t.Errorf("previous owner p2 should get its bonus back, got %d", p2.BonusCounters)
			}
			if !containsStr(s.Discard, "some-card") {
				t.Error("attached card should be discarded on takeover")
			}
		}
	}
	if !found {
		t.Fatal("expected a takeover in some seed")
	}
}

func containsStr(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
