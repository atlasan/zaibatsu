package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func bonusFixtureData(t *testing.T) *domain.GameData {
	t.Helper()
	gd := loadOrSkip(t)
	core, ok := gd.CentralCore()
	if !ok {
		t.Fatal("missing central core")
	}
	basis := *core
	bonusBlock := func(id string, corners []bool, ice domain.IceValue) domain.Block {
		copied := basis
		copied.ID = id
		copied.Name = id
		copied.IsCentralCore = false
		copied.IceValue = ice
		if ice == domain.IceHigh {
			copied.IceFaces = []int{1, 2, 3, 4, 5, 6}
		} else {
			copied.IceFaces = nil
		}
		copied.Edges = []bool{true, true, true, true, true, true}
		copied.BoundarySpaces = [][]string{{"a"}, {"a"}, {"a"}, {"a"}, {"a"}, {"a"}}
		copied.BonusCorners = append([]bool{}, corners...)
		copied.BonusFragments = 0
		for _, corner := range corners {
			if corner {
				copied.BonusFragments++
			}
		}
		copied.Spaces = []domain.Space{{ID: "a", Type: "special", ZoneIDs: []string{"h1"}, Capacity: domain.UnlimitedCapacity}}
		return copied
	}
	gd.Blocks = append(gd.Blocks,
		bonusBlock("bonus-a", []bool{false, true, false, false, false, false}, domain.IceNone),
			bonusBlock("bonus-b", []bool{false, false, false, true, false, false}, domain.IceNone),
			bonusBlock("bonus-c", []bool{false, false, false, false, false, true}, domain.IceHigh),
	)
	gd.Cards = append(gd.Cards, domain.ActionCard{
		ID:   "bonus-cost-card",
		Name: "Bonus Cost Card",
		Attach: &domain.Attach{
			As:   "pawn",
			Slot: "gadget",
			Cost: 1,
		},
	})
	return gd
}

func bonusGame(t *testing.T) (*domain.GameData, *domain.GameState, *domain.Player, *domain.PawnOnBoard) {
	t.Helper()
	gd := bonusFixtureData(t)
	state, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	if err != nil {
		t.Fatalf("new game: %v", err)
	}
	if _, err := PlaceBlock(state, domain.Coord{Q: 0, R: 0}, 5, gd, "bonus-a", 0); err != nil {
		t.Fatalf("place bonus-a: %v", err)
	}
	if _, err := PlaceBlock(state, domain.Coord{Q: 0, R: 0}, 0, gd, "bonus-b", 0); err != nil {
		t.Fatalf("place bonus-b: %v", err)
	}
	player := state.Players[0]
	scout := state.Cybernet.PawnByID(player.PawnID)
	scout.Coord = domain.Coord{Q: 0, R: 1}
	scout.SpaceID = "a"
	state.Cybernet.At(domain.Coord{Q: 0, R: 1}).OwnerID = player.ID
	state.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID = player.ID
	player.ControlMarkersPlaced = 2
	state.BlockPile = []string{"bonus-c"}
	return gd, state, player, scout
}

func TestSearchCreatesBonusIconAndIcebreakCollectsItExactlyOnce(t *testing.T) {
	gd, state, player, scout := bonusGame(t)

	placed, err := Search(state, gd, scout.PawnID, 0, 0)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if placed.Coord != (domain.Coord{Q: 1, R: 1}) {
		t.Fatalf("placed coord = %+v, want {1 1}", placed.Coord)
	}
	if len(state.Cybernet.BonusIcons) != 1 {
		t.Fatalf("bonus icon count = %d, want 1", len(state.Cybernet.BonusIcons))
	}
	icon := state.Cybernet.BonusIcons[0]
	wantCoords := []domain.Coord{{Q: 0, R: 1}, {Q: 1, R: 0}, {Q: 1, R: 1}}
	for i := range wantCoords {
		if icon.Coords[i] != wantCoords[i] {
			t.Fatalf("icon coord[%d] = %+v, want %+v", i, icon.Coords[i], wantCoords[i])
		}
	}
	if icon.CollectedBy != "" {
		t.Fatalf("icon collectedBy = %q, want empty", icon.CollectedBy)
	}

	scout.Coord = domain.Coord{Q: 1, R: 1}
	result, err := IcebreakBlock(state, gd, scout.PawnID, domain.Coord{Q: 1, R: 1}, 0)
	if err != nil {
		t.Fatalf("icebreak: %v", err)
	}
	if !result.Success {
		t.Fatal("expected guaranteed Icebreak success")
	}
	if player.BonusCounters != 1 {
		t.Fatalf("bonus counters = %d, want 1", player.BonusCounters)
	}
	if icon.CollectedBy != player.ID {
		t.Fatalf("icon collectedBy = %q, want %q", icon.CollectedBy, player.ID)
	}
	if got := CollectControlledBonusIcons(state, player.ID); len(got) != 0 {
		t.Fatalf("extra collected icons = %d, want 0", len(got))
	}
	if player.BonusCounters != 1 {
		t.Fatalf("bonus counters after recheck = %d, want 1", player.BonusCounters)
	}
}

func TestBoardEarnedBonusCountersCanPayAttachmentCosts(t *testing.T) {
	gd, state, player, scout := bonusGame(t)

	if _, err := Search(state, gd, scout.PawnID, 0, 0); err != nil {
		t.Fatalf("search: %v", err)
	}
	scout.Coord = domain.Coord{Q: 1, R: 1}
	if _, err := IcebreakBlock(state, gd, scout.PawnID, domain.Coord{Q: 1, R: 1}, 0); err != nil {
		t.Fatalf("icebreak: %v", err)
	}
	if player.BonusCounters != 1 {
		t.Fatalf("bonus counters = %d, want 1", player.BonusCounters)
	}

	player.Hand = []string{"bonus-cost-card"}
	if err := AttachToPawn(state, gd, player.ID, "bonus-cost-card", scout.PawnID); err != nil {
		t.Fatalf("attach: %v", err)
	}
	if player.BonusCounters != 0 {
		t.Fatalf("bonus counters after paying cost = %d, want 0", player.BonusCounters)
	}
	if got := state.Cybernet.PawnByID(scout.PawnID).Attachments[0].BonusPaid; got != 1 {
		t.Fatalf("bonus paid on attachment = %d, want 1", got)
	}
}
