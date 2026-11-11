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

func cardMarkerFixture(t *testing.T) malwareFixture {
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
	for _, p := range s.Players {
		s.Deck = append(s.Deck, p.Hand...)
		p.Hand = []string{}
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	f.take(t, 0, "worm")
	f.take(t, 1, "lima-flag")
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "idoru" })
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "idoru", Coord: domain.Coord{Q: 1}})
	s.Reserve = slices.DeleteFunc(s.Reserve, func(id string) bool { return id == "idoru" })
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", Coord: domain.Coord{Q: 1}, SpaceID: "idoru"})
	for _, p := range s.Cybernet.Pawns {
		p.Coord = domain.Coord{Q: 1}
		p.SpaceID = "idoru"
	}
	s.RNG = domain.NewRNG(79)
	return f
}
func cardMarkerAction(f malwareFixture, i int) Action {
	card := "worm"
	if i == 1 {
		card = "lima-flag"
	}
	return Action{Type: ActPlayIcebreakPawn, PawnID: f.s.Players[i].PawnID, TargetID: "idoru", CardID: card}
}

func TestIdoruAttributesAndSharedControlMarkerEvidence(t *testing.T) {
	f := cardMarkerFixture(t)
	p, _ := f.gd.PawnByID("idoru")
	if len(p.Class) != 0 || len(p.Abilities) != 0 || !reflect.DeepEqual(p.IceFaces, []int{1, 6}) || !p.Provisional || p.Movement.Activation != "card" || p.Movement.Steps != 0 || !reflect.DeepEqual(p.Slots, []string{"add-on", "armor"}) {
		t.Fatal(p)
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i == 0) {
			t.Fatal(p.Defense)
		}
	}
	initial := json.RawMessage(Snapshot(f.s))
	first := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 0))
	if !first.Accepted {
		t.Fatal(first)
	}
	gained := json.RawMessage(Snapshot(f.s))
	allocations := ControlMarkerAllocations(f.s)
	observer, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	f.s.CurrentPlayer = 1
	f.s.RNG = domain.NewRNG(79)
	second := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 1))
	if !second.Accepted {
		t.Fatal(second)
	}
	value := map[string]any{"attributes": map[string]any{"class": p.Class, "defense": p.Defense, "movement": p.Movement, "abilities": []domain.Ability{}, "iceFaces": p.IceFaces, "slots": p.Slots, "controlMarkerEffect": p.ControlMarkerEffect}, "initial": initial, "gained": gained, "allocations": allocations, "observer": observer, "transferred": json.RawMessage(Snapshot(f.s)), "events": [][]EngineEvent{first.Events, second.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "idoru-control-markers.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Idoru shared evidence mismatch", string(raw))
	}
}

func TestIdoruMarkerQueriesTransferAndIsolation(t *testing.T) {
	f := cardMarkerFixture(t)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	found := false
	for _, o := range AvailableActions(f.s, f.gd) {
		if o.Action.TargetID == "idoru" {
			found = true
		}
	}
	if !found || len(ControlMarkerAllocations(f.s)) != 0 || Snapshot(f.s) != before {
		t.Fatal("query mutated or omitted target")
	}
	copyRNG := *f.s.RNG
	if copyRNG.Intn(10000) != rng.Intn(10000) {
		t.Fatal("query consumed RNG")
	}
	if r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 0)); !r.Accepted {
		t.Fatal(r)
	}
	if f.s.Players[0].ControlMarkersPlaced != 1 || len(f.s.ControlCardMarkers) != 1 {
		t.Fatal("missing physical allocation")
	}
	clone := CloneState(f.s)
	clone.ControlCardMarkers[0].PlayerID = "p2"
	view, err := PlayerView(f.s, f.gd, "")
	if err != nil {
		t.Fatal(err)
	}
	view.ControlCardMarkers[0].Amount = 10
	if f.s.ControlCardMarkers[0].PlayerID != "p1" || f.s.ControlCardMarkers[0].Amount != 1 {
		t.Fatal("projection alias")
	}
	if err := GainPawnControl(f.s, f.gd, "idoru", "p1"); err != nil {
		t.Fatal(err)
	}
	if f.s.Players[0].ControlMarkersPlaced != 1 {
		t.Fatal("repeat instruction")
	}
	f.s.CurrentPlayer = 1
	f.s.RNG = domain.NewRNG(79)
	if r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 1)); !r.Accepted {
		t.Fatal(r)
	}
	if f.s.Players[0].ControlMarkersPlaced != 0 || f.s.Players[1].ControlMarkersPlaced != 1 || f.s.ControlCardMarkers[0].PlayerID != "p2" {
		t.Fatal("marker transfer")
	}
}

func TestIdoruMarkerImmediateVictory(t *testing.T) {
	f := cardMarkerFixture(t)
	f.s.Players[0].ControlMarkersTotal = 1
	r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 0))
	if !r.Accepted || f.s.WinnerID != "p1" {
		t.Fatal(r)
	}
	types := []EventType{}
	for _, e := range r.Events {
		if e.Type == "control-marker-placed" || e.Type == EventWinnerDeclared {
			types = append(types, e.Type)
		}
	}
	if !reflect.DeepEqual(types, []EventType{"control-marker-placed", EventWinnerDeclared}) || len(AvailableActions(f.s, f.gd)) != 0 {
		t.Fatal(types)
	}
	cardMarkerReject(t, f, Action{Type: ActPass})
}

func TestIdoruMalformedAllocationsRejectAtomically(t *testing.T) {
	for _, kind := range []string{"missing-card", "exhausted", "duplicate", "amount", "handler"} {
		t.Run(kind, func(t *testing.T) {
			f := cardMarkerFixture(t)
			switch kind {
			case "missing-card":
				f.s.ControlCards = slices.DeleteFunc(f.s.ControlCards, func(c domain.ControlCardState) bool { return c.Subject.ID == "idoru" })
			case "exhausted":
				f.s.Players[0].ControlMarkersPlaced = f.s.Players[0].ControlMarkersTotal
			case "duplicate":
				f.s.ControlCardMarkers = []domain.ControlCardMarker{{PlayerID: "p2", CardID: "idoru-control", Amount: 1}, {PlayerID: "p2", CardID: "idoru-control", Amount: 1}}
			case "amount":
				f.s.ControlCardMarkers = []domain.ControlCardMarker{{PlayerID: "p2", CardID: "idoru-control", Amount: 2}}
			case "handler":
				p, _ := f.gd.PawnByID("idoru")
				p.ControlMarkerEffect.Kind = "unknown"
			}
			cardMarkerReject(t, f, cardMarkerAction(f, 0))
		})
	}
}

func TestIdoruCommonCardRetentionAndUnresolvedReacquisition(t *testing.T) {
	f := cardMarkerFixture(t)
	if r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 0)); !r.Accepted {
		t.Fatal(r)
	}
	if !eliminatePawn(f.s, "idoru", f.gd) {
		t.Fatal("elimination rejected")
	}
	if !slices.Contains(f.s.Reserve, "idoru") || len(f.s.ControlCardMarkers) != 1 || f.s.Players[0].ControlMarkersPlaced != 1 {
		t.Fatal("literal retention lost marker")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "idoru" && c.Zone != "common" {
			t.Fatal(c)
		}
	}
	before := Snapshot(f.s)
	err := GainPawnControl(f.s, f.gd, "idoru", "p1")
	if err == nil || !strings.Contains(err.Error(), "source ruling") || Snapshot(f.s) != before {
		t.Fatal(err)
	}
}

func cardMarkerReject(t *testing.T, f malwareFixture, a Action) {
	t.Helper()
	before := Snapshot(f.s)
	rng := *f.s.RNG
	r := ApplyWithEvents(f.s, f.gd, a)
	now := *f.s.RNG
	if r.Accepted || Snapshot(f.s) != before || now.Intn(10000) != rng.Intn(10000) {
		t.Fatal("rejection changed state/RNG", r)
	}
}

func TestIdoruFailedRollAndAttachmentRefunds(t *testing.T) {
	missed := cardMarkerFixture(t)
	missed.s.RNG = domain.NewRNG(1)
	r := ApplyWithEvents(missed.s, missed.gd, cardMarkerAction(missed, 0))
	if !r.Accepted || len(missed.s.ControlCardMarkers) != 0 || len(missed.s.Players[0].Hand) != 0 || !slices.Contains(missed.s.PlayedCards, "worm") || missed.s.Cybernet.PawnByID("idoru").OwnerID != "" {
		t.Fatal(r)
	}
	for _, e := range r.Events {
		if e.Type == EventRoll && !reflect.DeepEqual(e.Roll, []int{2}) {
			t.Fatal(e)
		}
	}
	f := cardMarkerFixture(t)
	if r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 0)); !r.Accepted {
		t.Fatal(r)
	}
	f.take(t, 0, "dummy")
	f.s.Players[0].BonusCounters = 1
	if r := ApplyWithEvents(f.s, f.gd, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: "idoru"}); !r.Accepted || f.s.Players[0].BonusCounters != 0 {
		t.Fatal(r)
	}
	f.s.CurrentPlayer = 1
	f.s.RNG = domain.NewRNG(79)
	if r := ApplyWithEvents(f.s, f.gd, cardMarkerAction(f, 1)); !r.Accepted {
		t.Fatal(r)
	}
	if f.s.Players[0].BonusCounters != 1 || !slices.Contains(f.s.Discard, "dummy") || len(f.s.Cybernet.PawnByID("idoru").Attachments) != 0 || f.s.Players[0].ControlMarkersPlaced != 0 || f.s.Players[1].ControlMarkersPlaced != 1 {
		t.Fatal("attachment/marker cleanup")
	}
	v := cardMarkerFixture(t)
	if r := ApplyWithEvents(v.s, v.gd, cardMarkerAction(v, 0)); !r.Accepted {
		t.Fatal(r)
	}
	pIdoru, _ := v.gd.PawnByID("idoru")
	pIdoru.Class = []string{"cleaner"} // synthetic eligibility isolates the Virus/card-marker journal
	v.take(t, 1, "virus")
	v.s.CurrentPlayer = 1
	taken := ApplyWithEvents(v.s, v.gd, Action{Type: ActAttachEnemy, CardID: "virus", PawnID: v.s.Players[1].PawnID, TargetID: "idoru"})
	if !taken.Accepted {
		t.Fatal(taken)
	}
	order := []EventType{}
	for _, e := range taken.Events {
		if (e.Type == "control-marker-returned" || e.Type == EventControlChanged || e.Type == "control-marker-placed") && e.ElementID != "markers" {
			order = append(order, e.Type)
		}
	}
	if !reflect.DeepEqual(order, []EventType{"control-marker-returned", EventControlChanged, "control-marker-placed"}) || v.s.Players[0].ControlMarkersPlaced != 0 || v.s.Players[1].ControlMarkersPlaced != 1 {
		t.Fatal(order)
	}
	bad := cardMarkerFixture(t)
	p, _ := bad.gd.PawnByID("idoru")
	p.ControlMarkerEffect.Kind = "unknown"
	if _, err := NewGame(Config{Data: bad.gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "unsupported control-marker effect") {
		t.Fatal(err)
	}
}
