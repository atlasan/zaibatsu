package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"strings"
	"testing"
)

func zeroMovementFixture(t *testing.T, regression ...bool) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if len(regression) > 0 && regression[0] {
		gd, err = data.LoadRegression("speedrunners")
	}
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for i := range s.Players {
		s.Deck = append(s.Deck, s.Players[i].Hand...)
		s.Players[i].Hand = nil
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	f.take(t, 0, "move-1")
	f.take(t, 0, "move-1")
	p, _ := gd.PawnByID(f.actor)
	p.Movement = domain.Movement{Type: "steps", Steps: 2, Activation: "once-per-turn"}
	return f
}
func TestZeroMovementSharedSnapshotsEventsAndPhysicalCosts(t *testing.T) {
	f := zeroMovementFixture(t)
	before := json.RawMessage(Snapshot(f.s))
	cards := slotInventory(f.s)
	rng := *f.s.RNG
	options := []AvailableAction{}
	for _, o := range AvailableActions(f.s, f.gd) {
		if o.Action.Type == ActMoveSteps || o.Action.Type == ActPlayMove {
			options = append(options, o)
			if len(o.Targets) != 0 || len(o.Responses) != 1 {
				t.Fatal(o)
			}
		}
	}
	if len(options) != 2 {
		t.Fatal(options)
	}
	free := useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, Path: []SpaceRef{}})
	spent := json.RawMessage(Snapshot(f.s))
	if UseMarkerAllocations(f.s)[0].Ability != "move" {
		t.Fatal("native use not spent")
	}
	rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.actor})
	events := append([]EngineEvent{}, free.Events...)
	for i := 0; i < 2; i++ {
		r := useMarkerCommand(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{}})
		events = append(events, r.Events...)
		if len(f.s.PlayedCards) != i+1 || len(UseMarkerAllocations(f.s)) != 1 {
			t.Fatal("incorrect physical cost or free marker")
		}
	}
	actual := *f.s.RNG
	if len(f.s.Players[0].Hand) != 0 || !reflect.DeepEqual(slotInventory(f.s), cards) || actual.Intn(100000) != rng.Intn(100000) || f.s.Cybernet.PawnByID(f.actor).SpaceID != "core" {
		t.Fatal("zero movement changed location, RNG or inventory")
	}
	for _, e := range events {
		if e.Type == "roll" || e.Type == "pawn-moved" {
			t.Fatal(e)
		}
	}
	value := map[string]any{"before": before, "options": options, "spent": spent, "after": json.RawMessage(Snapshot(f.s)), "events": events}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "zero-movement.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("zero movement shared evidence mismatch", string(raw))
	}
	for i := 0; i < 8; i++ {
		if !AdvancePhase(f.s, f.gd).Accepted {
			t.Fatal("phase advance")
		}
	}
	if len(UseMarkerAllocations(f.s)) != 0 {
		t.Fatal("beginning did not reset")
	}
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor})
}
func TestZeroMovementClampedAllowanceAndLimitedGrants(t *testing.T) {
	for _, paid := range []bool{false, true} {
		f := zeroMovementFixture(t)
		activation := "once-per-turn"
		if paid {
			activation = "card"
		}
		f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-zero-grant", Name: "Synthetic limited movement", Attach: &domain.Attach{As: "pawn", Slot: "gadget", MovementModifier: -99, GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 2}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: activation, PerTurn: 2}}}})
		f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-zero-grant", Slot: "gadget", SlotRef: "pawn:gadget"}}
		rng := *f.s.RNG
		before := Snapshot(f.s)
		for _, o := range AvailableActions(f.s, f.gd) {
			if o.Movement != nil && (o.MaxSteps != 0 || len(o.Targets) != 0 || len(o.Responses) != 1) {
				t.Fatal(o)
			}
		}
		if Snapshot(f.s) != before {
			t.Fatal("query mutated state")
		}
		a := Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1}
		if paid {
			a.CardID = "move-1"
		}
		for i := 0; i < 2; i++ {
			useMarkerCommand(t, f, a)
		}
		if UseMarkerAllocations(f.s)[0].Uses != 2 {
			t.Fatal("grant limit not spent")
		}
		want := 0
		if paid {
			want = 2
		}
		if len(f.s.PlayedCards) != want {
			t.Fatal("incorrect costs")
		}
		rejectMovement(t, f, a)
		actual := *f.s.RNG
		if actual.Intn(100000) != rng.Intn(100000) {
			t.Fatal("zero activation consumed RNG")
		}
	}
}
func TestZeroMovementRejectionAuthorityAndCancellation(t *testing.T) {
	for _, kind := range []string{"native-cancel", "attached-cancel", "wrong-owner", "missing-card", "missing-pawn", "phase", "winner", "over-budget"} {
		f := zeroMovementFixture(t)
		a := Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1"}
		switch kind {
		case "native-cancel":
			p, _ := f.gd.PawnByID(f.actor)
			p.Movement.Activation = "none"
		case "attached-cancel":
			f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-zero-cancel", Name: "Synthetic cancellation", Attach: &domain.Attach{As: "pawn", Slot: "gadget", Removes: []string{"move"}}})
			f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-zero-cancel", Slot: "gadget"}}
		case "wrong-owner":
			a.PawnID = f.target
		case "missing-card":
			a.CardID = "missing"
		case "missing-pawn":
			a.PawnID = "missing"
		case "phase":
			f.s.Phase = domain.PhaseBeginning
		case "winner":
			f.s.WinnerID = "p1"
		case "over-budget":
			a.Path = []SpaceRef{{Coord: domain.Coord{Q: 99}, SpaceID: "missing"}}
		}
		rejectMovement(t, f, a)
		if strings.HasSuffix(kind, "cancel") {
			for _, o := range AvailableActions(f.s, f.gd) {
				if o.Movement != nil {
					t.Fatal("cancelled movement offered", o)
				}
			}
		}
	}
	f := zeroMovementFixture(t)
	f.s.PendingChoice = &domain.PendingChoice{ID: "fixture-other-choice", PlayerID: "p1", Kind: "discard-or-sacrifice", EffectID: "fixture", PawnID: f.actor, CardID: "toxin", Amount: 1}
	rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.actor})
	g := zeroMovementFixture(t)
	if !strings.Contains(rejectMovement(t, g, Action{Type: ActMoveSteps, PawnID: g.actor, CardID: "move-1"}).Error, "free movement") {
		t.Fatal("free movement ignored supplied payment")
	}
}
func TestZeroMovementThreatAndFrozenCompatibility(t *testing.T) {
	f := zeroMovementFixture(t)
	f.s.Threats = []domain.ThreatOnBoard{{ID: "fixture-threat", ThreatID: "guard", Coord: domain.Coord{}, SpaceID: "core", Status: "inactive"}}
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor})
	if f.s.PendingThreats != nil || f.s.Threats[0].Status != "inactive" {
		t.Fatal("staying put awakened a threat")
	}
	g := zeroMovementFixture(t, true)
	for _, a := range []Action{{Type: ActMoveSteps, PawnID: g.actor}, {Type: ActPlayMove, PawnID: g.actor, CardID: "move-1"}} {
		r := rejectMovement(t, g, a)
		if !strings.Contains(r.Error, "empty movement path") {
			t.Fatal(r)
		}
	}
}
