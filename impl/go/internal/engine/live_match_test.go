package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func quickMatchData(t *testing.T) *domain.GameData {
	t.Helper()
	gd, err := data.LoadRegression("speedrunners", "speedrunners-quick-match")
	if err != nil {
		t.Fatal(err)
	}
	return gd
}

func TestQuickMatchRealBlockControlVictory(t *testing.T) {
	gd := quickMatchData(t)
	sd, _ := data.FindSpecDir()
	raw, err := os.ReadFile(filepath.Join(sd, "..", "..", "golden", "quick-match.trace.json"))
	if err != nil {
		t.Fatal(err)
	}
	var trace struct {
		Setup struct {
			PlayerNames []string `json:"playerNames"`
			Seed        uint64   `json:"seed"`
		} `json:"setup"`
		Commands []struct {
			Kind   string `json:"kind"`
			Action Action `json:"action"`
		} `json:"commands"`
	}
	if err := json.Unmarshal(raw, &trace); err != nil {
		t.Fatal(err)
	}
	s, _ := NewGame(Config{Data: gd, PlayerNames: trace.Setup.PlayerNames, Seed: trace.Setup.Seed})
	for i, command := range trace.Commands {
		var result TransitionResult
		if command.Kind == "phase" {
			result = AdvancePhase(s, gd)
		} else {
			result = ApplyWithEvents(s, gd, command.Action)
		}
		if !result.Accepted {
			t.Fatalf("command %d: %s", i, result.Error)
		}
	}
	owned := 0
	for _, block := range s.Cybernet.Blocks {
		if block.OwnerID == "p2" {
			owned++
		}
	}
	if s.WinnerID != "p2" || owned != 4 {
		t.Fatalf("winner=%s, owned=%d", s.WinnerID, owned)
	}
	if got, want := Snapshot(s), readGolden(t, "quick-match.snap"); got != want {
		t.Fatalf("quick match snapshot mismatch\ngot: %s\nwant: %s", got, want)
	}
	before := Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActPass}).Accepted || AdvancePhase(s, gd).Accepted {
		t.Fatal("finished match advanced")
	}
	if Snapshot(s) != before {
		t.Fatal("finished state mutated")
	}
}

func TestLiveActionAuthority(t *testing.T) {
	gd := quickMatchData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 101})
	AdvancePhase(s, gd)
	before := Snapshot(s)
	for _, action := range []Action{
		{Type: ActPlaceMarker},
		{Type: ActSearch, PawnID: s.Players[0].PawnID},
		{Type: ActMoveHex, PawnID: s.Players[1].PawnID},
		{Type: ActPass, ExtraSkulls: 5},
	} {
		if ApplyWithEvents(s, gd, action).Accepted {
			t.Fatalf("accepted unauthorized action: %#v", action)
		}
	}
	if Snapshot(s) != before {
		t.Fatal("rejection mutated state")
	}
}

func TestRejectedDicePathRestoresRNG(t *testing.T) {
	gd := quickMatchData(t)
	core, _ := gd.CentralCore()
	core.Spaces = []domain.Space{{ID: "a", Type: "special", Neighbors: []string{"b"}}, {ID: "b", Type: "special", Neighbors: []string{"a"}}}
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 101})
	AdvancePhase(s, gd)
	before := Snapshot(s)
	control := CloneState(s)
	path := []SpaceRef{}
	for i := 0; i < 7; i++ {
		space := "b"
		if i%2 == 1 {
			space = "a"
		}
		path = append(path, SpaceRef{Coord: domain.Coord{}, SpaceID: space})
	}
	result := ApplyWithEvents(s, gd, Action{Type: ActMoveSteps, PawnID: "speedrunner-blue", Path: path})
	if result.Accepted || !strings.Contains(result.Error, "budget") {
		t.Fatalf("expected budget rejection: %#v", result)
	}
	if Snapshot(s) != before || s.RNG.Intn(1000) != control.RNG.Intn(1000) {
		t.Fatal("rejection changed state or RNG")
	}
}

func TestCardSplitDeleteCostAndRoll(t *testing.T) {
	gd := quickMatchData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	s.Cybernet.Pawns = []*domain.PawnOnBoard{{PawnID: "speedrunner-green", OwnerID: "p1", SpaceID: "core"}, {PawnID: "speedrunner-yellow", OwnerID: "p2", SpaceID: "core"}}
	s.Players[0].Hand = []string{"move-1", "move-1"}
	AdvancePhase(s, gd)
	result := ApplyWithEvents(s, gd, Action{Type: ActPlayDeleteMulti, PawnID: "speedrunner-green", CardID: "move-1", TargetIDs: []string{"speedrunner-yellow", "speedrunner-yellow"}})
	roll := []int{}
	for _, event := range result.Events {
		if event.Type == EventRoll {
			roll = event.Roll
		}
	}
	if !result.Accepted || len(roll) != 2 || len(s.Players[0].Hand) != 1 || len(s.PlayedCards) != 1 {
		t.Fatalf("cost/roll failure: %#v", result)
	}
}

func TestCardActivatedGrantedMovementPayment(t *testing.T) {
	gd := quickMatchData(t)
	core, _ := gd.CentralCore()
	core.Spaces = []domain.Space{{ID: "a", Type: "special", Neighbors: []string{"b"}}, {ID: "b", Type: "special", Neighbors: []string{"a"}}}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "grant", Name: "Grant", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 1}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "card"}}}})
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 101})
	s.Cybernet.PawnByID("speedrunner-blue").Attachments = []domain.Attachment{{CardID: "grant", Slot: "gadget"}}
	s.Players[0].Hand = []string{"move-1"}
	AdvancePhase(s, gd)
	action := Action{Type: ActMoveSteps, PawnID: "speedrunner-blue", MovementIndex: 1, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}}
	if ApplyWithEvents(s, gd, action).Accepted {
		t.Fatal("unpaid movement accepted")
	}
	action.CardID = "move-1"
	if result := ApplyWithEvents(s, gd, action); !result.Accepted {
		t.Fatal(result.Error)
	}
	if len(s.Players[0].Hand) != 0 || len(s.PlayedCards) != 1 || s.Players[0].OncePerTurnUsed["move:speedrunner-blue:base"] {
		t.Fatal("incorrect movement payment or base-use consumption")
	}
}
