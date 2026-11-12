package engine

import (
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func armamentFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "move-1", "move-1", "move-2", "move-2", "move-3", "worm", "servocanon", "ak-12km"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "move-1"} {
		f.take(t, 1, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "armament-research" })
	s.BlockPile = append(s.BlockPile, "armament-research")
	return f
}
func armamentAt(space string) SpaceRef {
	return SpaceRef{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: space}
}
func armamentReveal(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func armamentPlace(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:4"})
}
func armamentEnter(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{armamentAt("drone-hulk")}})
}
func armamentCapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	t.Helper()
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1, R: 0}})
}
func armamentCards(f malwareFixture) []string {
	out := append([]string{}, f.s.Deck...)
	out = append(out, f.s.Discard...)
	out = append(out, f.s.PlayedCards...)
	for _, p := range f.s.Players {
		out = append(out, p.Hand...)
	}
	for _, pawn := range f.s.Cybernet.Pawns {
		for _, att := range pawn.Attachments {
			out = append(out, att.CardID)
		}
	}
	slices.Sort(out)
	return out
}
func armamentSteps(f malwareFixture, space string) []string {
	out := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1, R: 0}, space, f.actor) {
		out = append(out, ref.SpaceID)
	}
	slices.Sort(out)
	return out
}
func TestArmamentResearchBilingualGeometryCaptureAndSharedByteEvidence(t *testing.T) {
	f := armamentFixture(t)
	b, _ := f.gd.BlockByID("armament-research")
	p, _ := f.gd.PawnByID("drone-hulk")
	if b.IceValue != domain.IceBlack || !slices.Equal(b.IceFaces, []int{6}) || !b.BlackIce || b.BonusFragments != 0 || !reflect.DeepEqual(b.BonusCorners, []bool{false, false, false, false, false, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h3", "h4", "h6", "h7"}) || len(b.SpaceArrows) != 0 || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "drone-hulk" || b.Provisional || !slices.Equal(p.Class, []string{"drone"}) || !slices.Equal(p.IceFaces, []int{5}) || p.Movement.Type != "hex" || p.Movement.Steps != 0 || p.Movement.Activation != "once-per-turn" || len(p.Abilities) != 1 || p.Abilities[0].Ability != "delete" || p.Abilities[0].Activation != "card" || p.Abilities[0].Skulls != 4 || !slices.Equal(p.Slots, []string{"module"}) {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 5) {
			t.Fatal("printed defense")
		}
	}
	if len(b.Spaces) != 2 || b.Spaces[0].ID != "drone-hulk" || !slices.Equal(b.Spaces[0].ZoneIDs, []string{"h1", "h2"}) || b.Spaces[0].Type != "pawn" || b.Spaces[0].Capacity != domain.UnlimitedCapacity || b.Spaces[0].DisplayShape != "circle" || b.Spaces[1].ID != "hand" || !slices.Equal(b.Spaces[1].ZoneIDs, []string{"h5"}) || b.Spaces[1].Modifier == nil || b.Spaces[1].Modifier.Kind != "hand-size" || b.Spaces[1].Modifier.Amount != -1 {
		t.Fatal("printed spaces")
	}
	if !reflect.DeepEqual(b.Edges, []bool{false, false, true, false, false, true}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{}, {}, {"hand"}, {}, {}, {"drone-hulk"}}) {
		t.Fatal("entrances", b.Edges, b.BoundarySpaces)
	}
	initial := Snapshot(f.s)
	reveal := armamentReveal(t, f)
	placed := armamentPlace(t, f)
	moved := armamentEnter(t, f)
	captured := armamentCapture(t, f, f.actor, "worm")
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": Snapshot(f.s), "options": options, "view": view, "finished": Snapshot(f.s), "events": [][]EngineEvent{reveal.Events, placed.Events, moved.Events, captured.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "armament-research.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Armament Research shared evidence mismatch")
	}
}
func TestArmamentResearchOnlyHomeAndHandEntrancesCanFaceCore(t *testing.T) {
	f := armamentFixture(t)
	armamentReveal(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			ids = append(ids, a.OptionID)
		}
	}
	if !slices.Equal(ids, []string{"place:0:1", "place:0:4"}) {
		t.Fatal("entrances", ids)
	}
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("preview state/RNG")
	}
	antroReject(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	if !slices.Contains(f.s.Discard, "dj") || f.s.PendingChoice.BlockID != "armament-research" {
		t.Fatal("rejected placement undid reveal/payment")
	}
}
func TestArmamentResearchPlacementDeploysNothingAndCaptureUsesTheOnePhysicalPawn(t *testing.T) {
	f := armamentFixture(t)
	before := armamentCards(f)
	armamentReveal(t, f)
	armamentPlace(t, f)
	if !slices.Contains(f.s.Reserve, "drone-hulk") || f.s.Cybernet.PawnByID("drone-hulk") != nil {
		t.Fatal("placement deployed a pawn")
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "drone-hulk" && (card.Zone != "common" || card.OwnerID != "") {
			t.Fatal("card left common", card)
		}
	}
	armamentEnter(t, f)
	r := armamentCapture(t, f, f.actor, "worm")
	pawn := f.s.Cybernet.PawnByID("drone-hulk")
	if pawn == nil || pawn.OwnerID != "p1" || pawn.Coord != (domain.Coord{Q: 1, R: 0}) || pawn.SpaceID != "drone-hulk" || slices.Contains(f.s.Reserve, "drone-hulk") {
		t.Fatal("capture", pawn)
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "drone-hulk" && (card.Zone != "control" || card.OwnerID != "p1") {
			t.Fatal("card", card)
		}
	}
	changed, placed := -1, -1
	for i, e := range r.Events {
		if e.Type == "control-changed" && e.Element == "block" && changed < 0 {
			changed = i
		}
		if e.Type == "pawn-placed" {
			placed = i
		}
	}
	if changed < 0 || placed < 0 || changed > placed || !slices.Equal(armamentCards(f), before) {
		t.Fatal("timing or inventory", changed, placed)
	}
}
func TestArmamentResearchHandSpaceAndHomeEntrance(t *testing.T) {
	f := armamentFixture(t)
	armamentReveal(t, f)
	armamentPlace(t, f)
	armamentEnter(t, f)
	profile, err := HandSizeProfileFor(f.s, f.gd, "p1")
	if err != nil || profile.Spaces != 0 || !slices.Equal(armamentSteps(f, "drone-hulk"), []string{"core", "hand"}) || !slices.Equal(armamentSteps(f, "hand"), []string{"drone-hulk"}) {
		t.Fatal("home entrance", profile, armamentSteps(f, "drone-hulk"), armamentSteps(f, "hand"), err)
	}
	antroReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{armamentAt("h4")}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{armamentAt("hand")}})
	profile, err = HandSizeProfileFor(f.s, f.gd, "p1")
	other, otherErr := HandSizeProfileFor(f.s, f.gd, "p2")
	if err != nil || otherErr != nil || profile != (HandSizeProfile{Base: 5, Spaces: -1, Maximum: 4}) || other.Spaces != 0 {
		t.Fatal("hand size", profile, other, err)
	}
	armamentCapture(t, f, f.actor, "worm")
	dice, err := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID("drone-hulk"))
	vulnerable := []int{}
	for _, die := range dice {
		if !die.Shielded {
			vulnerable = append(vulnerable, die.Value)
		}
	}
	if err != nil || !slices.Equal(vulnerable, []int{6}) {
		t.Fatal("defense", vulnerable, err)
	}
}
func TestArmamentResearchHexMovementAndFourSkullDelete(t *testing.T) {
	f := armamentFixture(t)
	armamentReveal(t, f)
	armamentPlace(t, f)
	armamentEnter(t, f)
	armamentCapture(t, f, f.actor, "worm")
	antroReject(t, f, Action{Type: ActMoveSteps, PawnID: "drone-hulk"})
	antroReject(t, f, Action{Type: ActMoveHex, PawnID: "drone-hulk", Dir: 0})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-hulk", CardID: "move-1", Path: []SpaceRef{armamentAt("hand")}})
	if f.s.Cybernet.PawnByID("drone-hulk").SpaceID != "hand" {
		t.Fatal("paid step")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-hulk", CardID: "move-1", Path: []SpaceRef{armamentAt("drone-hulk")}})
	antroAccept(t, f, Action{Type: ActMoveHex, PawnID: "drone-hulk", Dir: 3})
	moved := f.s.Cybernet.PawnByID("drone-hulk")
	if moved.Coord != (domain.Coord{}) || moved.SpaceID != "core" {
		t.Fatal("hex", moved)
	}
	antroReject(t, f, Action{Type: ActMoveHex, PawnID: "drone-hulk", Dir: 0})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-hulk", CardID: "move-2", Path: []SpaceRef{armamentAt("drone-hulk")}})
	antroReject(t, f, Action{Type: ActRollDelete, PawnID: "drone-hulk"})
	f.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-hulk", CardID: "move-2"})
	skulls := 0
	for _, e := range rolled.Events {
		if e.Type == "roll" {
			skulls = len(e.Roll)
		}
	}
	if skulls != 4 || !slices.Contains(f.s.PlayedCards, "move-2") {
		t.Fatal("four skulls", skulls, f.s.PlayedCards)
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.actor, f.actor, f.actor, f.actor}})
	if !slices.Contains(f.s.Eliminated, f.actor) {
		t.Fatal("actor survived")
	}
	for _, action := range []Action{{Type: ActSearch, PawnID: "drone-hulk"}, {Type: ActReboot, PawnID: "drone-hulk"}, {Type: ActIcebreakBlk, PawnID: "drone-hulk", Coord: &domain.Coord{Q: 1, R: 0}}} {
		antroReject(t, f, action)
	}
}
func TestArmamentResearchModuleRefundsOnTakeoverAndStaysForSameController(t *testing.T) {
	f := armamentFixture(t)
	armamentReveal(t, f)
	armamentPlace(t, f)
	armamentEnter(t, f)
	armamentCapture(t, f, f.actor, "worm")
	f.s.Players[0].BonusCounters = 1
	slots := []string{}
	for _, slot := range PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID("drone-hulk")) {
		slots = append(slots, slot.Slot)
	}
	if !slices.Equal(slots, []string{"module"}) {
		t.Fatal(slots)
	}
	antroReject(t, f, Action{Type: ActAttachPawn, TargetID: "drone-hulk", CardID: "ak-12km"})
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-hulk", CardID: "servocanon", SlotRef: "pawn:module"})
	if f.s.Players[0].BonusCounters != 0 {
		t.Fatal("cost")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{armamentAt("hand")}})
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-1", Path: []SpaceRef{armamentAt("drone-hulk")}})
	armamentCapture(t, f, f.target, "move-1")
	taken := f.s.Cybernet.PawnByID("drone-hulk")
	if taken == nil || taken.OwnerID != "p2" || taken.SpaceID != "drone-hulk" || len(taken.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("takeover", taken, f.s.Players[0].BonusCounters)
	}
	again := armamentFixture(t)
	armamentReveal(t, again)
	armamentPlace(t, again)
	armamentEnter(t, again)
	armamentCapture(t, again, again.actor, "worm")
	again.s.Players[0].BonusCounters = 1
	antroAccept(t, again, Action{Type: ActAttachPawn, TargetID: "drone-hulk", CardID: "servocanon", SlotRef: "pawn:module"})
	block := again.s.Cybernet.At(domain.Coord{Q: 1, R: 0})
	block.OwnerID = "p2"
	again.s.Players[0].ControlMarkersPlaced = 0
	again.s.Players[1].ControlMarkersPlaced = 1
	armamentCapture(t, again, again.actor, "move-2")
	kept := again.s.Cybernet.PawnByID("drone-hulk")
	if kept.OwnerID != "p1" || len(kept.Attachments) != 1 || again.s.Players[0].BonusCounters != 0 {
		t.Fatal("same controller", kept, again.s.Players[0].BonusCounters)
	}
}
func TestArmamentResearchMissingPieceRejectsAndLastMarkerVictoryDeploysNothing(t *testing.T) {
	f := armamentFixture(t)
	armamentReveal(t, f)
	armamentPlace(t, f)
	armamentEnter(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "drone-hulk" })
	f.s.RNG = domain.NewRNG(5)
	antroReject(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1, R: 0}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") || f.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID != "" {
		t.Fatal("rollback")
	}
	won := armamentFixture(t)
	armamentReveal(t, won)
	armamentPlace(t, won)
	armamentEnter(t, won)
	won.s.Players[0].ControlMarkersTotal = 1
	armamentCapture(t, won, won.actor, "worm")
	if won.s.WinnerID != "p1" || !slices.Contains(won.s.Reserve, "drone-hulk") || won.s.Cybernet.PawnByID("drone-hulk") != nil {
		t.Fatal("victory", won.s.WinnerID)
	}
}
func TestArmamentResearchStrictSourceConstructionRejectsAMissingControlCard(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "armament-research" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "drone-hulk" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "drone-hulk" })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "drone-hulk") {
		t.Fatal("strict", err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "drone-hulk" })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "control card") {
		t.Fatal(err)
	}
	full, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	copied, err := NewGame(Config{Data: full, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 1})
	if err != nil {
		t.Fatal(err)
	}
	clone := CloneState(copied)
	if !slices.Contains(clone.Reserve, "drone-hulk") {
		t.Fatal("clone")
	}
}
