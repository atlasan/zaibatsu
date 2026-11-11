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

func gynoidFixture(t *testing.T) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B", "C"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for _, p := range s.Players {
		s.Deck = append(s.Deck, p.Hand...)
		p.Hand = []string{}
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	for _, id := range []string{"dj", "move-2", "worm", "move-1"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-1", "move-1", "move-2"} {
		f.take(t, 1, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "pink-district" })
	s.BlockPile = append(s.BlockPile, "pink-district")
	return f
}
func gynoidPlace(t *testing.T, f malwareFixture) (TransitionResult, TransitionResult) {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "gynoid"}}})
	return a, b
}
func gynoidCapture(t *testing.T, f malwareFixture) TransitionResult {
	f.s.RNG = domain.NewRNG(1)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
}
func gynoidReady(t *testing.T) malwareFixture {
	f := gynoidFixture(t)
	gynoidPlace(t, f)
	gynoidCapture(t, f)
	return f
}
func gynoidBegin(t *testing.T, f malwareFixture) TransitionResult {
	f.s.Phase = domain.PhaseBeginning
	f.s.RNG = domain.NewRNG(11)
	r := AdvancePhase(f.s, f.gd)
	if !r.Accepted {
		t.Fatal(r)
	}
	return r
}
func gynoidResponse(f malwareFixture, targetID string) Action {
	a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "skip"}
	if targetID != "" {
		a.OptionID = "steal"
		a.TargetID = targetID
	}
	return a
}
func TestGynoidPinkBilingualRecordsAndSharedByteEvidence(t *testing.T) {
	f := gynoidFixture(t)
	b, _ := f.gd.BlockByID("pink-district")
	g, _ := f.gd.PawnByID("gynoid")
	if !slices.Equal(b.IceFaces, []int{2, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, false, false, false, true, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || b.Spaces[0].Capacity != 2 || b.Spaces[1].Capacity != 2 || b.Spaces[2].Capacity != domain.UnlimitedCapacity || !reflect.DeepEqual(b.SpaceArrows, []domain.SpaceArrow{{From: "gynoid", To: "left"}}) || !slices.Equal(g.Class, []string{"lovedoll"}) || !slices.Equal(g.IceFaces, []int{2, 3, 4, 5}) || len(g.Defense) != 6 || !g.Defense[0].Shielded || g.Movement.Activation != "card" || len(g.Abilities) != 0 || !slices.Equal(g.Slots, []string{"add-on", "armor"}) {
		t.Fatal("printed attributes")
	}
	for i, d := range g.Defense {
		if d.Value != i+1 || d.Shielded != (i == 0) {
			t.Fatal("printed defense")
		}
	}
	initial := Snapshot(f.s)
	a, p := gynoidPlace(t, f)
	placed := Snapshot(f.s)
	c := gynoidCapture(t, f)
	controlled := Snapshot(f.s)
	start := gynoidBegin(t, f)
	pending := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	observer, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	r := antroAccept(t, f, gynoidResponse(f, f.target))
	history := map[string]any{}
	for label, id := range map[string]string{"thief": "p1", "victim": "p2", "other": "p3", "spectator": ""} {
		events, err := EventsForPlayer(f.s, r.Events, id)
		if err != nil {
			t.Fatal(err)
		}
		history[label] = events
	}
	value := map[string]any{"initial": initial, "placed": placed, "controlled": controlled, "pending": pending, "options": options, "observer": observer, "finished": Snapshot(f.s), "events": [][]EngineEvent{a.Events, p.Events, c.Events, start.Events, r.Events}, "history": history}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "gynoid.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("shared Gynoid byte evidence mismatch", string(raw))
	}
}
func TestGynoidPureCountOnlyOptionsAndBeginningAuthority(t *testing.T) {
	f := gynoidReady(t)
	gynoidBegin(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	options := AvailableActions(f.s, f.gd)
	targets := []string{}
	for _, a := range options[0].Responses {
		if a.TargetID == "" {
			targets = append(targets, "skip")
		} else {
			targets = append(targets, a.TargetID)
		}
	}
	if !slices.Equal(targets, []string{"skip", f.actor, f.target}) || len(AvailableActions(f.s, f.gd, "p2")) != 0 {
		t.Fatal("targets", targets)
	}
	raw, _ := json.Marshal(options)
	if strings.Contains(string(raw), "move-1") {
		t.Fatal("query leaked identity")
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("query mutation")
	}
	clone := CloneState(f.s)
	clone.PendingEffects[0].Scope = ""
	if f.s.PendingEffects[0].Scope != "cybernet" {
		t.Fatal("clone aliases source")
	}
	actions := []Action{gynoidResponse(f, f.target), gynoidResponse(f, "gynoid"), gynoidResponse(f, f.s.Players[2].PawnID), gynoidResponse(f, ""), gynoidResponse(f, f.target), gynoidResponse(f, f.target), {Type: ActPass}}
	actions[0].PlayerID = "p2"
	actions[3].TargetID = f.target
	actions[4].CardIDs = []string{"move-1"}
	actions[5].ChoiceID = "stale"
	for _, a := range actions {
		restrictionReject(t, f.s, f.gd, a)
	}
	before = Snapshot(f.s)
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase interleaved")
	}
}
func TestGynoidPhysicalRandomTheftAndHistoricalPrivacy(t *testing.T) {
	f := gynoidReady(t)
	cards := sprawlInventory(f.s)
	gynoidBegin(t, f)
	from := append([]string{}, f.s.Players[1].Hand...)
	rng := *f.s.RNG
	at := rng.Intn(len(from))
	expected := from[at]
	from = slices.Delete(from, at, at+1)
	r := antroAccept(t, f, gynoidResponse(f, f.target))
	after := *f.s.RNG
	if f.s.Players[0].Hand[len(f.s.Players[0].Hand)-1] != expected || !slices.Equal(f.s.Players[1].Hand, from) || !slices.Equal(sprawlInventory(f.s), cards) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("transfer conservation/RNG")
	}
	types := []EventType{}
	for _, e := range r.Events {
		types = append(types, e.Type)
	}
	if !slices.Equal(types, []EventType{EventChoiceResolved, "card-stolen", EventPhaseAdvanced}) {
		t.Fatal("duplicate draw", types)
	}
	for _, id := range []string{"p1", "p2", "p3", ""} {
		events, err := EventsForPlayer(f.s, r.Events, id)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range events {
			if e.Type == "card-stolen" && ((id == "p1" || id == "p2") && e.CardID != expected || (id == "p3" || id == "") && e.CardID != "") {
				t.Fatal("theft visibility", id, e)
			}
		}
	}
	view, err := PlayerView(f.s, f.gd, "p3")
	if err != nil || len(view.Players[0].Hand.Cards) != 0 {
		t.Fatal("hand privacy", err)
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: "old", OptionID: "steal", TargetID: f.target})
}
func TestGynoidFriendlyTargetEmptyHandsAndDecline(t *testing.T) {
	f := gynoidReady(t)
	gynoidBegin(t, f)
	before := append([]string{}, f.s.Players[0].Hand...)
	rng := *f.s.RNG
	at := rng.Intn(len(before))
	card := before[at]
	before = slices.Delete(before, at, at+1)
	before = append(before, card)
	r := antroAccept(t, f, gynoidResponse(f, f.actor))
	after := *f.s.RNG
	if !slices.Equal(f.s.Players[0].Hand, before) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("friendly transfer")
	}
	count := 0
	for _, e := range r.Events {
		if e.Type == "card-stolen" {
			count++
		}
		if e.Type == EventDraw {
			t.Fatal("friendly transfer synthesized draw")
		}
	}
	if count != 1 {
		t.Fatal("theft event count")
	}
	empty := gynoidReady(t)
	for _, p := range empty.s.Players {
		empty.s.Deck = append(empty.s.Deck, p.Hand...)
		p.Hand = []string{}
	}
	gynoidBegin(t, empty)
	responses := AvailableActions(empty.s, empty.gd)[0].Responses
	if len(responses) != 1 || responses[0].OptionID != "skip" {
		t.Fatal("empty targets")
	}
	rng = *empty.s.RNG
	antroAccept(t, empty, gynoidResponse(empty, ""))
	after = *empty.s.RNG
	if empty.s.Phase != domain.PhaseAction || empty.s.PendingChoice != nil || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("decline spent RNG")
	}
}
func TestPinkExistingPawnRelocationTakeoverCleanupAndRefund(t *testing.T) {
	f := gynoidFixture(t)
	gynoidPlace(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
	f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", Coord: domain.Coord{}, SpaceID: "core"})
	if err := GainPawnControl(f.s, f.gd, "gynoid", "p2"); err != nil {
		t.Fatal(err)
	}
	copyleftGrant(t, f.s, "p2", 2)
	f.take(t, 1, "weapon-gunhed")
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "weapon-gunhed", TargetID: "gynoid", SlotRef: "pawn:add-on"})
	f.s.CurrentPlayer = 0
	cards := sprawlInventory(f.s)
	r := gynoidCapture(t, f)
	g := f.s.Cybernet.PawnByID("gynoid")
	if g.OwnerID != "p1" || g.Coord != (domain.Coord{Q: 1}) || g.SpaceID != "gynoid" || len(g.Attachments) != 0 || f.s.Players[1].BonusCounters != 2 || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("placement/cleanup/refund")
	}
	sequence := []EventType{}
	for _, e := range r.Events {
		if (e.Type == "card-discarded" || e.Type == "pawn-relocated" || e.Type == EventControlChanged) && e.ElementID != "markers" {
			sequence = append(sequence, e.Type)
		}
	}
	if !slices.Equal(sequence, []EventType{EventControlChanged, "card-discarded", "pawn-relocated", EventControlChanged}) {
		t.Fatal("operation order", sequence)
	}
}
func TestPinkSameControllerPreservesCardsAtomicMismatchAndVictoryStopsPlacement(t *testing.T) {
	f := gynoidFixture(t)
	gynoidPlace(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
	f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", SpaceID: "core"})
	if err := GainPawnControl(f.s, f.gd, "gynoid", "p1"); err != nil {
		t.Fatal(err)
	}
	copyleftGrant(t, f.s, "p1", 2)
	f.take(t, 0, "weapon-gunhed")
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "weapon-gunhed", TargetID: "gynoid", SlotRef: "pawn:add-on"})
	gynoidCapture(t, f)
	if f.s.Cybernet.PawnByID("gynoid").Attachments[0].CardID != "weapon-gunhed" {
		t.Fatal("same controller discarded attachments")
	}
	bad := gynoidFixture(t)
	gynoidPlace(t, bad)
	for i := range bad.s.ControlCards {
		if bad.s.ControlCards[i].Subject.ID == "gynoid" {
			bad.s.ControlCards[i].OwnerID = "p2"
		}
	}
	bad.s.RNG = domain.NewRNG(1)
	restrictionReject(t, bad.s, bad.gd, Action{Type: ActPlayIcebreakBlk, PawnID: bad.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	win := gynoidFixture(t)
	gynoidPlace(t, win)
	win.s.Players[0].ControlMarkersTotal = 1
	r := gynoidCapture(t, win)
	if win.s.WinnerID != "p1" || !slices.Contains(win.s.Reserve, "gynoid") || win.s.Cybernet.PawnByID("gynoid") != nil || slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == EventPawnPlaced }) {
		t.Fatal("victory continued block effects")
	}
}
func TestGynoidEliminationMarkerCleanupAndExplicitSimultaneousGap(t *testing.T) {
	f := gynoidReady(t)
	f.s.Players[0].OncePerTurnUsed["fixture-spent"] = true
	gynoidBegin(t, f)
	if !f.s.Players[0].OncePerTurnUsed["fixture-spent"] {
		t.Fatal("early marker reset")
	}
	antroAccept(t, f, gynoidResponse(f, ""))
	if len(f.s.Players[0].OncePerTurnUsed) != 0 {
		t.Fatal("marker cleanup")
	}
	eliminatePawn(f.s, "gynoid", f.gd)
	if !slices.Contains(f.s.Reserve, "gynoid") {
		t.Fatal("Gynoid incorrectly retained")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "gynoid" && c.Zone != "common" {
			t.Fatal("control card retained")
		}
	}
	f.s.Phase = domain.PhaseBeginning
	if !AdvancePhase(f.s, f.gd).Accepted || f.s.PendingChoice != nil {
		t.Fatal("eliminated native trigger")
	}
	combined := gynoidReady(t)
	combined.take(t, 0, "electric-sheep")
	copyleftGrant(t, combined.s, "p1", 2)
	antroAccept(t, combined, Action{Type: ActAttachPawn, CardID: "electric-sheep", TargetID: combined.actor, SlotRef: "pawn:add-on"})
	combined.s.Phase = domain.PhaseBeginning
	before := Snapshot(combined.s)
	rng := *combined.s.RNG
	r := AdvancePhase(combined.s, combined.gd)
	after := *combined.s.RNG
	if r.Accepted || !strings.Contains(r.Error, "ordering") || Snapshot(combined.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("unresolved order silently accepted", r)
	}
}
func TestPinkArrowUnlimitedHomeAndNoInventedGynoidSearch(t *testing.T) {
	f := gynoidReady(t)
	forward := StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1}, "gynoid", "gynoid")
	reverse := StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1}, "left", "gynoid")
	if !slices.ContainsFunc(forward, func(r SpaceRef) bool { return r.SpaceID == "left" }) || slices.ContainsFunc(reverse, func(r SpaceRef) bool { return r.SpaceID == "gynoid" }) || len(f.s.Cybernet.SpaceOccupants(domain.Coord{Q: 1}, "gynoid")) != 2 {
		t.Fatal("printed topology")
	}
	for _, o := range AvailableActions(f.s, f.gd) {
		if o.Action.PawnID == "gynoid" && strings.Contains(string(o.Action.Type), "search") {
			t.Fatal("invented native Search")
		}
	}
}

func TestGynoidDescriptorValidationAndIndependentOfficialOrderingGate(t *testing.T) {
	for _, field := range []string{"scope", "trigger", "amount", "target", "optional"} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		p, _ := gd.PawnByID("gynoid")
		e := &p.PhaseEffects[0]
		switch field {
		case "scope":
			e.Scope = "unsupported"
		case "trigger":
			e.Trigger = "end-action"
		case "amount":
			e.Amount = 2
		case "target":
			e.Target = "enemy"
		case "optional":
			e.Optional = false
		}
		if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "native pawn phase effect") {
			t.Fatal("bad native descriptor", field, err)
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "gynoid" })
	if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "physical control card") {
		t.Fatal("missing card", err)
	}
	gd, err = data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := gd.BlockByID("pink-district")
	b.Effects = domain.BlockEffects{InCybernet: &domain.BlockEffect{Kind: "place-controlled-pawn", Target: "gynoid"}}
	if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "under-control timing") {
		t.Fatal("bad placement", err)
	}
	gd, err = data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "gynoid" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "gynoid" })
	for i := range gd.Pawns {
		gd.Pawns[i].Provisional = false
	}
	for i := range gd.ControlCards {
		gd.ControlCards[i].Provisional = false
	}
	gd.Cards = nil
	if _, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "native phase-effect ordering") {
		t.Fatal("official ordering gate bypassed", err)
	}
}

func TestGynoidTheftRecordsEventTimePublicHandReveal(t *testing.T) {
	f := gynoidReady(t)
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "core"}}})
	f.take(t, 0, "trojan")
	antroAccept(t, f, Action{Type: ActAttachEnemy, CardID: "trojan", PawnID: f.actor, TargetID: f.target, SlotRef: "pawn:add-on"})
	gynoidBegin(t, f)
	r := antroAccept(t, f, gynoidResponse(f, f.target))
	var event EngineEvent
	for _, e := range r.Events {
		if e.Type == "card-stolen" {
			event = e
		}
	}
	if !event.CardRevealed {
		t.Fatal("source-defined public hand reveal lost")
	}
	history, err := EventsForPlayer(f.s, r.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range history {
		if e.Type == "card-stolen" && e.CardID != event.CardID {
			t.Fatal("public theft hidden")
		}
	}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.target), 0, &[]EngineEvent{})
	view, err := PlayerView(f.s, f.gd, "p3")
	if err != nil || view.Players[1].Hand.Visibility != "hidden" {
		t.Fatal("current hand visibility", err)
	}
	history, err = EventsForPlayer(f.s, r.Events, "p3")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range history {
		if e.Type == "card-stolen" && e.CardID != event.CardID {
			t.Fatal("historical public reveal forgotten")
		}
	}
}

func TestGynoidOrdinaryTurnsAndPawnTakeoverMoveTheNextBeginningDecision(t *testing.T) {
	f := gynoidReady(t)
	next := func() {
		for i := 0; i < 4; i++ {
			if r := AdvancePhase(f.s, f.gd); !r.Accepted {
				t.Fatal(r)
			}
		}
	}
	if f.s.PendingChoice != nil {
		t.Fatal("acquisition triggered beginning effect")
	}
	next()
	if f.s.CurrentPlayer != 1 || f.s.Phase != domain.PhaseAction || f.s.PendingChoice != nil {
		t.Fatal("wrong player's beginning")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "gynoid"}}})
	f.s.RNG = domain.NewRNG(1)
	antroAccept(t, f, Action{Type: ActPlayIcebreakPawn, PawnID: f.target, CardID: "move-1", TargetID: "gynoid"})
	if f.s.Cybernet.PawnByID("gynoid").OwnerID != "p2" || f.s.PendingChoice != nil {
		t.Fatal("pawn takeover timing")
	}
	next()
	if f.s.CurrentPlayer != 2 || f.s.PendingChoice != nil {
		t.Fatal("third player triggered effect")
	}
	next()
	if f.s.CurrentPlayer != 0 || f.s.PendingChoice != nil {
		t.Fatal("former controller triggered effect")
	}
	next()
	if f.s.CurrentPlayer != 1 || f.s.PendingChoice == nil || f.s.PendingChoice.Kind != "steal-card" || f.s.PendingChoice.PlayerID != "p2" {
		t.Fatal("new beginning controller")
	}
	a := gynoidResponse(f, f.actor)
	a.PlayerID = "p1"
	restrictionReject(t, f.s, f.gd, a)
	r := antroAccept(t, f, gynoidResponse(f, f.actor))
	if !slices.ContainsFunc(r.Events, func(e EngineEvent) bool {
		return e.Type == "card-stolen" && e.FromOwnerID == "p1" && e.ToOwnerID == "p2"
	}) {
		t.Fatal("new-controller theft")
	}
}
