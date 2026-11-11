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

func trojanFixture(t *testing.T) malwareFixture {
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
	for i := range s.Players {
		s.Deck = append(s.Deck, s.Players[i].Hand...)
		s.Players[i].Hand = nil
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	f.take(t, 0, "trojan")
	f.take(t, 0, "lima-flag")
	f.take(t, 1, "dummy")
	f.take(t, 1, "dj")
	return f
}
func trojanAttach(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	r := ApplyWithEvents(f.s, f.gd, Action{Type: ActAttachEnemy, PawnID: f.actor, TargetID: f.target, CardID: "trojan"})
	if !r.Accepted {
		t.Fatal(r)
	}
	return r
}
func mustView(t *testing.T, f malwareFixture, id string) PlayerViewState {
	t.Helper()
	v, err := PlayerView(f.s, f.gd, id)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestTrojanContinuousRevealSharedEvidence(t *testing.T) {
	f := trojanFixture(t)
	before := mustView(t, f, "")
	rng := *f.s.RNG
	cards := slotInventory(f.s)
	r := trojanAttach(t, f)
	if !ControllerHandRevealed(f.s, f.gd, "p2") || ControllerHandRevealed(f.s, f.gd, "p1") {
		t.Fatal("wrong reveal controller")
	}
	revealed := mustView(t, f, "")
	effects := []EngineEvent{}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.target), 0, &effects)
	removed := mustView(t, f, "")
	if removed.Players[1].Hand.Visibility != "hidden" || len(removed.Players[1].Hand.Cards) != 0 || removed.Players[1].Hand.Count != 2 || f.s.Players[1].BonusCounters != 0 {
		t.Fatal("removal visibility/cost")
	}
	if !reflect.DeepEqual(cards, slotInventory(f.s)) || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("conservation/RNG")
	}
	value := map[string]any{"before": before, "revealed": revealed, "removed": removed, "events": append(r.Events, effects...)}
	var got, want any
	b, _ := json.Marshal(value)
	_ = json.Unmarshal(b, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "player-view.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("player-view shared evidence mismatch", string(b))
	}
}
func TestPlayerViewsConcealAndAuthorize(t *testing.T) {
	f := trojanFixture(t)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	f.s.ThreatPile = []string{"private-threat"}
	own, other, spectator := mustView(t, f, "p1"), mustView(t, f, "p2"), mustView(t, f, "")
	if !slices.Equal(own.Players[0].Hand.Cards, []string{"trojan", "lima-flag"}) || len(own.Players[1].Hand.Cards) != 0 || len(other.Players[0].Hand.Cards) != 0 || !slices.Equal(other.Players[1].Hand.Cards, []string{"dummy", "dj"}) {
		t.Fatal("hand privacy")
	}
	if len(own.Options) == 0 || len(other.Options) != 0 || len(spectator.Options) != 0 {
		t.Fatal("action authority")
	}
	for _, p := range spectator.Players {
		if len(p.Hand.Cards) != 0 {
			t.Fatal("spectator hand leak")
		}
	}
	b, _ := json.Marshal(spectator)
	if strings.Contains(string(b), "private-threat") {
		t.Fatal("pile leak")
	}
	var raw map[string]any
	_ = json.Unmarshal(b, &raw)
	for _, key := range []string{"rng", "seed", "setup", "recoveryTrace", "pendingEffects"} {
		if _, ok := raw[key]; ok {
			t.Fatal("unexpected private field", key)
		}
	}
	search := 0
	for _, option := range own.Options {
		if option.Action.Type == ActSearch || option.Action.Type == ActPlaySearch {
			search++
			b, _ := json.Marshal(option.Action)
			var action map[string]any
			_ = json.Unmarshal(b, &action)
			if _, ok := action["dir"]; ok {
				t.Fatal("hidden Search direction")
			}
			if _, ok := action["rotation"]; ok {
				t.Fatal("hidden Search rotation")
			}
		}
	}
	if search == 0 {
		t.Fatal("missing Search declaration")
	}
	slices.Reverse(f.s.Deck)
	slices.Reverse(f.s.BlockPile)
	if !reflect.DeepEqual(mustView(t, f, "p1"), own) {
		t.Fatal("hidden pile permutation leaked")
	}
	slices.Reverse(f.s.Deck)
	slices.Reverse(f.s.BlockPile)
	f.s.ThreatPile = nil
	if Snapshot(f.s) != before || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("query mutated state/RNG")
	}
	if _, err := PlayerView(f.s, f.gd, "unknown"); err == nil {
		t.Fatal("unknown viewer accepted")
	}
}
func TestTrojanNewDrawsAndPrivateHistory(t *testing.T) {
	f := trojanFixture(t)
	trojanAttach(t, f)
	f.s.CurrentPlayer = 1
	f.s.Phase = domain.PhaseRecycle
	r := AdvancePhase(f.s, f.gd)
	if !r.Accepted {
		t.Fatal(r)
	}
	v := mustView(t, f, "p1")
	if !slices.Equal(v.Players[1].Hand.Cards, f.s.Players[1].Hand) || v.Players[1].Hand.Count <= 2 {
		t.Fatal("new draws hidden")
	}
	history := []EngineEvent{{Type: EventDraw, PlayerID: "p2", CardID: "private-old-card"}, {Type: EventValidationFail, PlayerID: "p2", Message: "private error"}, {Type: "card-discarded", CardID: "trojan"}}
	projected, err := EventsForPlayer(f.s, history, "p1")
	if err != nil || !reflect.DeepEqual(projected, []EngineEvent{{Type: EventDraw, PlayerID: "p2"}, {Type: "card-discarded", CardID: "trojan"}}) {
		t.Fatal("history leak", projected, err)
	}
	own, _ := EventsForPlayer(f.s, history, "p2")
	if !reflect.DeepEqual(own, history) {
		t.Fatal("own history lost")
	}
	if _, err := EventsForPlayer(f.s, history, "unknown"); err == nil {
		t.Fatal("unknown event viewer accepted")
	}
}
func TestTrojanLifecycleCleanup(t *testing.T) {
	for _, kind := range []string{"takeover", "eliminate", "provider", "duplicate"} {
		t.Run(kind, func(t *testing.T) {
			f := trojanFixture(t)
			trojanAttach(t, f)
			pawn := f.s.Cybernet.PawnByID(f.target)
			switch kind {
			case "takeover":
				def, _ := f.gd.PawnByID(f.target)
				def.IceFaces = []int{1, 2, 3, 4, 5, 6}
				r := ApplyWithEvents(f.s, f.gd, Action{Type: ActPlayIcebreakPawn, PawnID: f.actor, TargetID: f.target, CardID: "lima-flag"})
				if !r.Accepted {
					t.Fatal(r)
				}
			case "eliminate":
				finalizePawnElimination(f.s, f.target, f.gd, nil)
			case "provider":
				f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "provider", Name: "Synthetic provider", Attach: &domain.Attach{As: "pawn", Slot: "add-on", GrantsSlot: []string{"add-on"}}})
				pawn.Attachments[0].SlotRef = "pawn:add-on/add-on"
				pawn.Attachments = append([]domain.Attachment{{CardID: "provider", Slot: "add-on", SlotRef: "pawn:add-on"}}, pawn.Attachments...)
				DiscardPawnAttachment(f.s, f.gd, pawn, 0, nil)
			case "duplicate":
				f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "reveal-fixture", Name: "Synthetic second reveal", Attach: &domain.Attach{As: "pawn", Slot: "armor", ControllerHand: "face-up"}})
				pawn.Attachments = append(pawn.Attachments, domain.Attachment{CardID: "reveal-fixture", Slot: "armor", SlotRef: "pawn:armor"})
				DiscardPawnAttachment(f.s, f.gd, pawn, 0, nil)
				if !ControllerHandRevealed(f.s, f.gd, "p2") {
					t.Fatal("second reveal lost")
				}
				DiscardPawnAttachment(f.s, f.gd, pawn, 0, nil)
			}
			if ControllerHandRevealed(f.s, f.gd, "p2") || ControllerHandRevealed(f.s, f.gd, "p1") {
				t.Fatal("stale reveal")
			}
		})
	}
}
func TestPlayerViewPendingResponderAndIsolation(t *testing.T) {
	f := trojanFixture(t)
	f.s.PendingChoice = &domain.PendingChoice{ID: "fixture-choice", Kind: "discard-or-sacrifice", PlayerID: "p2", PawnID: f.target, CardID: "toxin", Amount: 1}
	before := Snapshot(f.s)
	rng := *f.s.RNG
	owner, other := mustView(t, f, "p2"), mustView(t, f, "p1")
	if owner.PendingChoice == nil || owner.Options[0].Action.Type != ActResolveChoice || len(other.Options) != 0 || other.PendingChoice != nil || other.Decision.PlayerID != "p2" {
		t.Fatal("decision authority")
	}
	owner.Players[1].Hand.Cards = append(owner.Players[1].Hand.Cards, "injected")
	owner.Pawns[0].Attachments = append(owner.Pawns[0].Attachments, snapAtt{CardID: "injected"})
	owner.Options[0].Action.ChoiceID = "injected"
	if Snapshot(f.s) != before || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("view aliases state/RNG")
	}
	copy := CloneState(f.s)
	copyFixture := f
	copyFixture.s = copy
	if !reflect.DeepEqual(mustView(t, copyFixture, "p1"), other) {
		t.Fatal("clone view differs")
	}
}
func TestTrojanRejectionsAndStripSeparation(t *testing.T) {
	for _, kind := range []string{"own", "slot", "repeat", "strip"} {
		t.Run(kind, func(t *testing.T) {
			f := trojanFixture(t)
			if kind == "repeat" {
				trojanAttach(t, f)
			}
			before := Snapshot(f.s)
			rng := *f.s.RNG
			a := Action{Type: ActAttachEnemy, PawnID: f.actor, TargetID: f.target, CardID: "trojan"}
			if kind == "own" {
				a.TargetID = f.actor
			}
			if kind == "slot" {
				a.SlotRef = "pawn:armor"
			}
			if kind == "strip" {
				core, _ := f.gd.CentralCore()
				core.Spaces[0].Neighbors = []string{"fixture-b"}
				core.Spaces = append(core.Spaces, domain.Space{ID: "fixture-b", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"core"}})
				a = Action{Type: ActPlayMove, PawnID: f.actor, CardID: "trojan", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "fixture-b"}}}
			}
			r := ApplyWithEvents(f.s, f.gd, a)
			if kind != "strip" {
				if r.Accepted || Snapshot(f.s) != before {
					t.Fatal("rejection mutated state", r)
				}
			} else if !r.Accepted || ControllerHandRevealed(f.s, f.gd, "p2") {
				t.Fatal("strip reveal", r)
			}
			if f.s.RNG.Intn(100000) != rng.Intn(100000) {
				t.Fatal("RNG changed")
			}
		})
	}
}
func TestTrojanRejectUnsupportedVisibility(t *testing.T) {
	for _, attach := range []domain.Attach{{As: "enemy", ControllerHand: "hidden"}, {As: "block", ControllerHand: "face-up"}} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		gd.Cards = append(gd.Cards, domain.ActionCard{ID: "bad", Name: "Bad", Attach: &attach})
		_, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
		if err == nil || !strings.Contains(err.Error(), "hand visibility") {
			t.Fatal("unsupported visibility accepted", err)
		}
	}
}
