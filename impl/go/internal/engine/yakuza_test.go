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

func yakuzaFixture(t *testing.T, protected bool, names ...string) malwareFixture {
	t.Helper()
	if len(names) == 0 {
		names = []string{"A", "B"}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: names, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for _, p := range s.Players {
		s.Deck = append(s.Deck, p.Hand...)
		p.Hand = []string{}
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	for _, id := range []string{"dj", "move-2", "worm", "move-1", "octagon-dex"} {
		f.take(t, 0, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "yakuza" })
	s.BlockPile = append(s.BlockPile, "yakuza")
	if protected {
		f.take(t, 1, "dummy")
		copyleftGrant(t, s, "p2", 1)
		s.CurrentPlayer = 1
		antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.target, SlotRef: "pawn:add-on"})
		s.CurrentPlayer = 0
	}
	return f
}
func yakuzaOpen(t *testing.T, f malwareFixture) (TransitionResult, TransitionResult, TransitionResult) {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "dragon"}}})
	f.s.RNG = domain.NewRNG(5)
	c := antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	return a, b, c
}
func yakuzaResponse(f malwareFixture, targetID string) Action {
	a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "skip"}
	if targetID != "" {
		a.OptionID = "attack"
		a.TargetID = targetID
	}
	return a
}
func TestYakuzaBilingualGeometryAndSharedAttackPreventionEvidence(t *testing.T) {
	f := yakuzaFixture(t, false)
	b, _ := f.gd.BlockByID("yakuza")
	if !slices.Equal(b.IceFaces, []int{4, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{false, true, true, false, true, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || b.Spaces[0].Capacity != 2 || b.Spaces[1].Capacity != 1 || b.Spaces[2].Capacity != 1 || b.Spaces[3].Capacity != 2 || !reflect.DeepEqual(b.SpaceArrows, []domain.SpaceArrow{{From: "right", To: "upper"}, {From: "left", To: "dragon"}}) || !reflect.DeepEqual(b.Spaces[0].Modifier.Dice, []domain.DefenseDie{{Value: 3}, {Value: 2}, {Value: 1}}) || b.Effects.UnderControl.Kind != "attack-pawn" || b.Effects.UnderControl.Amount != 1 || b.Effects.UnderControl.Scope != "adjacent-blocks" || !b.Effects.UnderControl.Optional {
		t.Fatal("printed attributes")
	}
	f = yakuzaFixture(t, true)
	initial := Snapshot(f.s)
	a, p, c := yakuzaOpen(t, f)
	pending := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	observer, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	attack := antroAccept(t, f, yakuzaResponse(f, f.target))
	threatened := Snapshot(f.s)
	responses := AvailableActions(f.s, f.gd, "p2")
	saved := antroAccept(t, f, Action{Type: ActResolveChoice, PlayerID: "p2", ChoiceID: f.s.PendingChoice.ID, OptionID: "prevent", CardID: "dummy"})
	spectator, err := EventsForPlayer(f.s, attack.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "pending": pending, "options": options, "observer": observer, "threatened": threatened, "responses": responses, "finished": Snapshot(f.s), "events": [][]EngineEvent{a.Events, p.Events, c.Events, attack.Events, saved.Events}, "spectator": spectator}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "yakuza.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Yakuza shared evidence mismatch", string(raw))
	}
}
func TestYakuzaPurePreviewsAndControllerAuthority(t *testing.T) {
	f := yakuzaFixture(t, false)
	yakuzaOpen(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	options := AvailableActions(f.s, f.gd)
	if len(options) != 1 || len(options[0].Responses) != 2 || options[0].Responses[0].OptionID != "skip" || options[0].Responses[1].TargetID != f.target || len(AvailableActions(f.s, f.gd, "p2")) != 0 {
		t.Fatal("controller options", options)
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("preview state/RNG")
	}
	clone := CloneState(f.s)
	clone.PendingChoice.Reference.Q = 99
	if f.s.PendingChoice.Reference.Q != 1 {
		t.Fatal("clone aliases origin")
	}
	actions := []Action{yakuzaResponse(f, f.target), yakuzaResponse(f, f.actor), yakuzaResponse(f, "missing"), yakuzaResponse(f, ""), yakuzaResponse(f, f.target), yakuzaResponse(f, f.target), yakuzaResponse(f, f.target), {Type: ActPass}}
	actions[0].PlayerID = "p2"
	actions[3].TargetID = f.target
	actions[4].CardIDs = []string{"move-1"}
	actions[5].ExtraSkulls = 1
	actions[6].ChoiceID = "stale"
	for _, a := range actions {
		restrictionReject(t, f.s, f.gd, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase advanced through decision")
	}
}
func TestYakuzaDeclineAndShieldedMissSpendOnlyAcceptedRoll(t *testing.T) {
	f := yakuzaFixture(t, false)
	yakuzaOpen(t, f)
	hand := append([]string{}, f.s.Players[0].Hand...)
	rng := *f.s.RNG
	antroAccept(t, f, yakuzaResponse(f, ""))
	after := *f.s.RNG
	if rng.Intn(100000) != after.Intn(100000) || !slices.Equal(hand, f.s.Players[0].Hand) || f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "p1" {
		t.Fatal("decline changed payment/control/RNG")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: "block-attack-2", OptionID: "attack", TargetID: f.target})
	missed := yakuzaFixture(t, false)
	yakuzaOpen(t, missed)
	missed.s.RNG = domain.NewRNG(1)
	rng = *missed.s.RNG
	rng.Intn(6)
	r := antroAccept(t, missed, yakuzaResponse(missed, missed.target))
	types := []EventType{}
	for _, e := range r.Events {
		types = append(types, e.Type)
	}
	after = *missed.s.RNG
	if !slices.Equal(types, []EventType{EventChoiceResolved, "block-attack-targeted", EventRoll}) || !slices.Equal(r.Events[2].Roll, []int{2}) || missed.s.Cybernet.PawnByID(missed.target) == nil || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("shielded miss", r)
	}
}
func TestYakuzaSingleDefenderPreventionAuthorityAndNoReroll(t *testing.T) {
	f := yakuzaFixture(t, true)
	cards := sprawlInventory(f.s)
	yakuzaOpen(t, f)
	hit := antroAccept(t, f, yakuzaResponse(f, f.target))
	if !slices.ContainsFunc(hit.Events, func(e EngineEvent) bool { return e.Type == EventRoll && slices.Equal(e.Roll, []int{3}) }) || f.s.PendingChoice.Kind != "prevent-elimination" || f.s.PendingChoice.PlayerID != "p2" || f.s.Cybernet.PawnByID(f.target) == nil {
		t.Fatal("defender window")
	}
	rng := *f.s.RNG
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, PlayerID: "p1", ChoiceID: f.s.PendingChoice.ID, OptionID: "prevent", CardID: "dummy"})
	if len(AvailableActions(f.s, f.gd, "p1")) != 0 {
		t.Fatal("attacker has defender options")
	}
	antroAccept(t, f, Action{Type: ActResolveChoice, PlayerID: "p2", ChoiceID: f.s.PendingChoice.ID, OptionID: "prevent", CardID: "dummy"})
	after := *f.s.RNG
	if f.s.PendingChoice != nil || f.s.Players[1].BonusCounters != 1 || len(f.s.Cybernet.PawnByID(f.target).Attachments) != 0 || !slices.Equal(cards, sprawlInventory(f.s)) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("prevention cleanup/refund/RNG")
	}
}
func TestYakuzaAllowedEliminationDiscardsNestedCardsRefundsAndRetainsReboot(t *testing.T) {
	f := yakuzaFixture(t, false)
	f.take(t, 1, "weapon-gunhed")
	f.take(t, 1, "dummy")
	copyleftGrant(t, f.s, "p2", 3)
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "weapon-gunhed", TargetID: f.target, SlotRef: "pawn:add-on"})
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.target, SlotRef: "pawn:add-on/add-on"})
	f.s.CurrentPlayer = 0
	cards := sprawlInventory(f.s)
	yakuzaOpen(t, f)
	antroAccept(t, f, yakuzaResponse(f, f.target))
	rng := *f.s.RNG
	r := antroAccept(t, f, Action{Type: ActResolveChoice, PlayerID: "p2", ChoiceID: f.s.PendingChoice.ID, OptionID: "allow"})
	after := *f.s.RNG
	if !slices.Contains(f.s.Eliminated, f.target) || f.s.Cybernet.PawnByID(f.target) != nil || f.s.Players[1].BonusCounters != 3 || !slices.Equal(f.s.Discard, []string{"dj", "weapon-gunhed", "dummy"}) || !slices.Equal(cards, sprawlInventory(f.s)) || rng.Intn(100000) != after.Intn(100000) || !slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == EventElimination }) {
		t.Fatal("elimination conservation/refund")
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == f.target && (card.OwnerID != "p2" || card.Zone != "control") {
			t.Fatal("retained Reboot control")
		}
	}
}
func TestYakuzaPhysicalRangeIndependentOfEntrancesAndRotation(t *testing.T) {
	f := yakuzaFixture(t, false, "A", "B", "C")
	third := f.s.Cybernet.PawnByID(f.s.Players[2].PawnID)
	core, _ := f.gd.BlockByID("central-core")
	outpost := *core
	outpost.ID = "fixture-outpost"
	outpost.Name = "Synthetic closed outpost"
	outpost.IsCentralCore = false
	outpost.Edges = make([]bool, 6)
	outpost.BoundarySpaces = [][]string{{}, {}, {}, {}, {}, {}}
	outpost.Provisional = true
	f.gd.Blocks = append(f.gd.Blocks, outpost)
	f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: outpost.ID, Coord: domain.Coord{Q: 3}, Rotation: 4})
	third.Coord = domain.Coord{Q: 3}
	id := third.PawnID
	yakuzaOpen(t, f)
	if slices.ContainsFunc(AvailableActions(f.s, f.gd)[0].Responses, func(a Action) bool { return a.TargetID == id }) {
		t.Fatal("distant target")
	}
	restrictionReject(t, f.s, f.gd, yakuzaResponse(f, id))
	f.s.Cybernet.At(domain.Coord{Q: 3}).Coord = domain.Coord{Q: 2}
	f.s.Cybernet.PawnByID(id).Coord = domain.Coord{Q: 2}
	f.s.Cybernet.At(domain.Coord{Q: 1}).Rotation = 3
	if !slices.ContainsFunc(AvailableActions(f.s, f.gd)[0].Responses, func(a Action) bool { return a.TargetID == id }) {
		t.Fatal("physical adjacent target hidden by closed edges")
	}
}
func TestYakuzaFriendlyNeutralTargetsAndEmptyDecline(t *testing.T) {
	for _, owner := range []string{"", "p1"} {
		f := yakuzaFixture(t, false)
		f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
		f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", SpaceID: "core"})
		if owner != "" {
			if err := GainPawnControl(f.s, f.gd, "gynoid", owner); err != nil {
				t.Fatal(err)
			}
		}
		yakuzaOpen(t, f)
		if !slices.ContainsFunc(AvailableActions(f.s, f.gd)[0].Responses, func(a Action) bool { return a.TargetID == "gynoid" }) {
			t.Fatal("friendly/neutral target missing")
		}
		r := antroAccept(t, f, yakuzaResponse(f, "gynoid"))
		if !slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == EventElimination && e.PawnID == "gynoid" }) || !slices.Contains(f.s.Reserve, "gynoid") {
			t.Fatal("neutral/friendly elimination")
		}
		for _, c := range f.s.ControlCards {
			if c.Subject.ID == "gynoid" && (c.Zone != "common" || c.OwnerID != "") {
				t.Fatal("common control release")
			}
		}
	}
	empty := yakuzaFixture(t, false)
	yakuzaOpen(t, empty)
	p := empty.s.Cybernet.PawnByID(empty.target)
	p.Coord = domain.Coord{Q: 1}
	p.SpaceID = "dragon"
	options := AvailableActions(empty.s, empty.gd)[0].Responses
	if len(options) != 1 || options[0].OptionID != "skip" {
		t.Fatal("no-target decline")
	}
	antroAccept(t, empty, yakuzaResponse(empty, ""))
}
func TestYakuzaWhiteSpaceDefenseAndBothInternalArrows(t *testing.T) {
	f := yakuzaFixture(t, false)
	yakuzaOpen(t, f)
	p := *f.s.Cybernet.PawnByID(f.actor)
	p.SpaceID = "upper"
	dice, err := DefenseProfile(f.s, f.gd, &p)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range dice {
		if d.Shielded {
			t.Fatal("flat white faces interpreted as ICE")
		}
	}
	b, _ := f.gd.BlockByID("yakuza")
	if !slices.Equal(b.IceFaces, []int{4, 6}) {
		t.Fatal("space changed block ICE")
	}
	has := func(from, to string) bool {
		return slices.ContainsFunc(StepTargets(f.gd, f.s.Cybernet, p.Coord, from, f.actor), func(r SpaceRef) bool { return r.SpaceID == to })
	}
	if !has("right", "upper") || has("upper", "right") || !has("left", "dragon") || has("dragon", "left") {
		t.Fatal("directed ring")
	}
	antroAccept(t, f, yakuzaResponse(f, ""))
	copyleftGrant(t, f.s, "p1", 1)
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "octagon-dex", TargetID: f.actor, SlotRef: "pawn:add-on"})
	if !has("upper", "right") || !has("dragon", "left") {
		t.Fatal("Octagon arrow exception")
	}
}
func TestYakuzaRepeatTakeoverStaleOwnerAndImmediateVictory(t *testing.T) {
	f := yakuzaFixture(t, false)
	yakuzaOpen(t, f)
	antroAccept(t, f, yakuzaResponse(f, ""))
	serial := f.s.DecisionSerial
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.Players[1].ControlMarkersPlaced = 1
	f.take(t, 0, "move-1")
	f.s.RNG = domain.NewRNG(5)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "move-1", Coord: &domain.Coord{Q: 1}})
	if f.s.DecisionSerial != serial+1 || f.s.Players[1].ControlMarkersPlaced != 0 {
		t.Fatal("repeat capture did not reactivate")
	}
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	restrictionReject(t, f.s, f.gd, yakuzaResponse(f, f.target))
	win := yakuzaFixture(t, false)
	win.s.Players[0].ControlMarkersTotal = 1
	yakuzaOpen(t, win)
	if win.s.WinnerID != "p1" || win.s.PendingChoice != nil || len(AvailableActions(win.s, win.gd)) != 0 {
		t.Fatal("victory opened further effects")
	}
}
func TestYakuzaDescriptorValidationAndIsolatedStrictAcceptance(t *testing.T) {
	for _, change := range []string{"scope", "optional", "amount", "target", "timing"} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("yakuza")
		e := b.Effects.UnderControl
		switch change {
		case "scope":
			e.Scope = "cybernet"
		case "optional":
			e.Optional = false
		case "amount":
			e.Amount = 0
		case "target":
			e.Target = "gynoid"
		case "timing":
			b.Effects = domain.BlockEffects{InCybernet: e}
		}
		if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "targeted block attack") {
			t.Fatal("malformed descriptor", change, err)
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "yakuza" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || len(s.Cybernet.Blocks) != 1 {
		t.Fatal("strict handler", err)
	}
}
