package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func classGame(t *testing.T) (*domain.GameData, *domain.GameState, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	return gd, s, s.Players[0].PawnID
}
func TestSourcePrintedAttachmentOwnClasses(t *testing.T) {
	type evidence struct {
		CardID   string   `json:"cardId"`
		Name     string   `json:"name"`
		Attached []string `json:"attached"`
		After    []string `json:"after"`
	}
	rows := []evidence{}
	for _, c := range []struct {
		id, class string
		cost      int
	}{{"accelerator-transgenic-therapy", "accelerator", 1}, {"hyper-accelerator", "accelerator", 1}, {"accela-accelerator", "accelerator", 1}, {"biochip", "e-synapse", 1}, {"e-synapse-neural-interface", "e-synapse", 2}, {"selective-disclosure", "trade-secret", 0}, {"insider-trading", "trade-secret", 1}} {
		gd, s, id := classGame(t)
		s.Players[0].Hand = []string{c.id}
		s.Players[0].BonusCounters = c.cost
		if !slices.Equal(cardByID(gd, c.id).Class, []string{c.class}) || !ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, TargetID: id, CardID: c.id}).Accepted || !slices.Equal(EffectivePawnClasses(gd, s.Cybernet.PawnByID(id)), []string{"operative", c.class}) {
			t.Fatal("missing printed class grant", c)
		}
		attached := EffectivePawnClasses(gd, s.Cybernet.PawnByID(id))
		def, _ := gd.PawnByID(id)
		if !slices.Equal(def.Class, []string{"operative"}) {
			t.Fatal("mutated definition")
		}
		def.IceFaces = []int{1, 2, 3, 4, 5, 6}
		s.CurrentPlayer = 1
		s.Players[1].Hand = []string{"dj"}
		if !ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakPawn, PawnID: s.Players[1].PawnID, TargetID: id, CardID: "dj"}).Accepted || !slices.Equal(EffectivePawnClasses(gd, s.Cybernet.PawnByID(id)), []string{"operative"}) || s.Players[0].BonusCounters != c.cost {
			t.Fatal("class cleanup", c)
		}
		rows = append(rows, evidence{CardID: c.id, Name: cardByID(gd, c.id).Name, Attached: attached, After: EffectivePawnClasses(gd, s.Cybernet.PawnByID(id))})
	}
	var expected []evidence
	if err := json.Unmarshal([]byte(readGolden(t, "attachment-classes.json")), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rows, expected) {
		t.Fatal("class query parity", rows)
	}
}
func blockClassGame(t *testing.T) (*domain.GameData, *domain.GameState, string) {
	gd, s, id := classGame(t)
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "fixture-attachment-block", Name: "Synthetic attachment block", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceHigh, IceFaces: []int{1, 2, 3, 4, 5, 6}, Spaces: []domain.Space{{ID: "core", Type: "special", Capacity: domain.UnlimitedCapacity}}})
	s.Cybernet.Blocks[0].BlockID = "fixture-attachment-block"
	s.Players[0].Hand = []string{"cracker"}
	return gd, s, id
}
func TestSourceGentlemanLoserIsNotIcebreakerPlacement(t *testing.T) {
	gd, s, id := blockClassGame(t)
	card := cardByID(gd, "cracker")
	if card.Name != "Gentleman Loser" || card.Type != "block" || card.Attach == nil || card.Attach.As != "block" || !card.Provisional || card.Effects[0].Trigger != "on-attach" {
		t.Fatal(card)
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakBlk, PawnID: id, CardID: "cracker", Coord: &domain.Coord{}})
	if !r.Accepted || s.Cybernet.PawnByID("cracker") != nil || !slices.Contains(s.Reserve, "cracker") || !slices.Equal(s.PlayedCards, []string{"cracker"}) {
		t.Fatal("attachment use leaked into ability activation", r)
	}
}
func TestSourceUnsupportedAttachmentTimeGate(t *testing.T) {
	gd, s, id := blockClassGame(t)
	before := Snapshot(s)
	rng := *s.RNG
	r := ApplyWithEvents(s, gd, Action{Type: ActAttachBlock, PawnID: id, CardID: "cracker", Coord: &domain.Coord{}})
	if r.Accepted || !strings.Contains(r.Error, "unsupported placement/choice resolution") || Snapshot(s) != before {
		t.Fatal(r)
	}
	for _, option := range AvailableActions(s, gd) {
		if option.Action.Type == ActAttachBlock && option.Action.CardID == "cracker" {
			t.Fatal("unsupported option offered")
		}
	}
	if Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal("query or rejection mutated state")
	}
	supported := []domain.Block{}
	for _, b := range gd.Blocks {
		if SupportsSearchBlockEffect(&b) {
			supported = append(supported, b)
		}
	}
	gd.Blocks = supported // isolate this attachment gate
	for i := range gd.Blocks {
		gd.Blocks[i].Provisional = false
	}
	for i := range gd.Pawns {
		gd.Pawns[i].Provisional = false
	}
	for i := range gd.Cards {
		gd.Cards[i].Provisional = false
	}
	for i := range gd.ControlCards {
		gd.ControlCards[i].Provisional = false
	}
	if _, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "unsupported attachment-time effects") {
		t.Fatal("unsupported mechanic accepted as official", err)
	}
}
