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

func toxinGame(t *testing.T) (*domain.GameData, *domain.GameState, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	pawn := s.Cybernet.PawnByID(s.Players[0].PawnID)
	pawn.Attachments = []domain.Attachment{{CardID: "toxin", Slot: "add-on"}}
	s.Players[0].Hand = []string{"dj", "dj"}
	s.Players[0].OncePerTurnUsed = map[string]bool{"old": true}
	return gd, s, pawn.PawnID
}

func TestPhaseToxinChoiceAuthorityAndDiscard(t *testing.T) {
	gd, s, _ := toxinGame(t)
	rng := *s.RNG
	started := AdvancePhase(s, gd)
	if !started.Accepted || len(started.Events) != 1 || started.Events[0].Type != EventChoiceRequired || s.Phase != domain.PhaseBeginning || !s.Players[0].OncePerTurnUsed["old"] {
		t.Fatal(started)
	}
	opts := AvailableActions(s, gd)
	if len(opts) != 1 || opts[0].Action.Type != ActResolveChoice || opts[0].Action.ChoiceID != s.PendingChoice.ID {
		t.Fatal(opts)
	}
	before := Snapshot(s)
	id := s.PendingChoice.ID
	for _, a := range []Action{{Type: ActPass}, {Type: ActResolveChoice, ChoiceID: "stale", OptionID: "sacrifice"}, {Type: ActResolveChoice, ChoiceID: id, OptionID: "discard", CardIDs: []string{"dj", "dj"}}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: id, OptionID: "discard", CardIDs: []string{"dj"}}} {
		if ApplyWithEvents(s, gd, a).Accepted || Snapshot(s) != before {
			t.Fatal("invalid response changed state")
		}
	}
	if AdvancePhase(s, gd).Accepted || Snapshot(s) != before {
		t.Fatal("phase skipped choice")
	}
	copy := CloneState(s)
	copy.PendingEffects[0].CardID = "changed"
	if s.PendingEffects[0].CardID != "toxin" {
		t.Fatal("queue shared")
	}
	result := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: id, OptionID: "discard", CardIDs: []string{"dj"}})
	types := []string{}
	for _, e := range result.Events {
		types = append(types, string(e.Type))
	}
	if !result.Accepted || !slices.Equal(types, []string{"choice-resolved", "card-discarded", "phase-advanced"}) || !slices.Equal(s.Players[0].Hand, []string{"dj"}) || !slices.Equal(s.Discard, []string{"dj"}) || s.Phase != domain.PhaseAction || len(s.Players[0].OncePerTurnUsed) != 0 || s.PendingChoice != nil || len(s.PendingEffects) != 0 || s.PendingPhase != "" {
		t.Fatal(result)
	}
	if s.RNG.Intn(10000) != rng.Intn(10000) {
		t.Fatal("choice changed RNG")
	}
	if ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: id, OptionID: "sacrifice"}).Accepted {
		t.Fatal("replayed choice accepted")
	}
}

func TestPhaseToxinSacrificeAndRefund(t *testing.T) {
	gd, s, pawnID := toxinGame(t)
	s.Players[0].Hand = nil
	s.Cybernet.PawnByID(pawnID).Attachments[0].BonusPaid = 2
	AdvancePhase(s, gd)
	if ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "discard", CardIDs: []string{"dj"}}).Accepted {
		t.Fatal("missing discard accepted")
	}
	if !ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "sacrifice"}).Accepted || !slices.Contains(s.Eliminated, pawnID) || s.Players[0].BonusCounters != 2 || !slices.Equal(s.Discard, []string{"toxin"}) || s.Phase != domain.PhaseAction {
		t.Fatal("sacrifice failed")
	}
}

func TestPhaseRootkitDiscardTiming(t *testing.T) {
	gd, s, pawnID := toxinGame(t)
	s.Phase = domain.PhaseAction
	s.Cybernet.PawnByID(pawnID).Attachments = []domain.Attachment{{CardID: "rootkit", Slot: "add-on"}}
	s.PlayedCards = []string{"octagon-dex"}
	result := AdvancePhase(s, gd)
	if !result.Accepted || s.Phase != domain.PhaseRecycle || len(s.Players[0].Hand) != 0 || !slices.Equal(s.Discard, []string{"dj", "dj"}) || !slices.Equal(s.PlayedCards, []string{"octagon-dex"}) {
		t.Fatal(result)
	}
}

func TestPhaseSelectiveDisclosureCleanup(t *testing.T) {
	gd, s, pawnID := toxinGame(t)
	s.Cybernet.PawnByID(pawnID).Attachments = []domain.Attachment{{CardID: "selective-disclosure", Slot: "add-on", BonusPaid: 1}}
	if !AdvancePhase(s, gd).Accepted || len(s.Cybernet.PawnByID(pawnID).Attachments) != 0 || !slices.Equal(s.Discard, []string{"selective-disclosure"}) || s.Players[0].BonusCounters != 1 || s.Phase != domain.PhaseAction {
		t.Fatal("self discard failed")
	}
}

func TestPhaseUnresolvedOrderingRollback(t *testing.T) {
	gd, s, _ := toxinGame(t)
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", OwnerID: "p1", Coord: domain.Coord{}, SpaceID: "core", Attachments: []domain.Attachment{{CardID: "selective-disclosure", Slot: "add-on"}}})
	before := Snapshot(s)
	rng := *s.RNG
	result := AdvancePhase(s, gd)
	if result.Accepted || !strings.Contains(result.Error, "ordering is unresolved") || Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal(result)
	}
}

func TestPhaseChoiceGoldenAndEvents(t *testing.T) {
	gd, s, _ := toxinGame(t)
	started := AdvancePhase(s, gd)
	if got, want := Snapshot(s), readGolden(t, "phase-choice.snap"); got != want {
		t.Fatalf("pending state parity\ngot %s\nwant %s", got, want)
	}
	resolved := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "discard", CardIDs: []string{"dj"}})
	var expected [][]EngineEvent
	if err := json.Unmarshal([]byte(readGolden(t, "phase-choice.events.json")), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual([][]EngineEvent{started.Events, resolved.Events}, expected) {
		t.Fatal("ordered event parity")
	}
}
