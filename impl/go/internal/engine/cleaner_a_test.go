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

func cleanerAFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "move-1", "move-1", "move-2", "move-2", "move-3", "worm", "ak-12km"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "move-1"} {
		f.take(t, 1, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "cleaner-a" })
	s.BlockPile = append(s.BlockPile, "cleaner-a")
	return f
}
func cleanerAAt(space string) SpaceRef {
	return SpaceRef{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: space}
}
func cleanerAReveal(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func cleanerAPlace(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:4"})
}
func cleanerAEnter(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAAt("upper-left")}})
}
func cleanerACapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	t.Helper()
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1, R: 0}})
}
func cleanerACards(f malwareFixture) []string {
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
func cleanerASteps(f malwareFixture, space string) []string {
	out := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1, R: 0}, space, f.actor) {
		out = append(out, ref.SpaceID)
	}
	slices.Sort(out)
	return out
}
func TestCleanerABilingualGeometryCaptureAndSharedByteEvidence(t *testing.T) {
	f := cleanerAFixture(t)
	b, _ := f.gd.BlockByID("cleaner-a")
	p, _ := f.gd.PawnByID("cleaner-a")
	if b.IceValue != domain.IceHigh || !slices.Equal(b.IceFaces, []int{6}) || b.BlackIce || slices.Contains(b.Edges, false) || b.BonusFragments != 0 || !reflect.DeepEqual(b.BonusCorners, []bool{false, false, false, false, false, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.SpaceArrows) != 2 || b.SpaceArrows[0].From != "one" || b.SpaceArrows[0].To != "cleaner-a" || b.SpaceArrows[1].From != "two" || b.SpaceArrows[1].To != "upper-right" || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "cleaner-a" || b.Provisional || len(p.Class) != 0 || len(p.IceFaces) != 0 || p.Movement.Type != "steps" || p.Movement.Steps != 0 || p.Movement.Activation != "card" || len(p.Abilities) != 1 || p.Abilities[0].Ability != "delete" || p.Abilities[0].Activation != "card" || p.Abilities[0].Skulls != 2 || !slices.Equal(p.Slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 3) {
			t.Fatal("printed defense")
		}
	}
	if len(b.Spaces) != 5 || b.Spaces[0].ID != "upper-left" || !slices.Equal(b.Spaces[0].ZoneIDs, []string{"h2"}) || b.Spaces[1].ID != "upper-right" || !slices.Equal(b.Spaces[1].ZoneIDs, []string{"h3"}) || b.Spaces[2].ID != "two" || !slices.Equal(b.Spaces[2].ZoneIDs, []string{"h4"}) || b.Spaces[2].Modifier == nil || b.Spaces[2].Modifier.Dice[0].Value != 2 || b.Spaces[2].Modifier.Dice[0].Shielded || b.Spaces[3].ID != "one" || !slices.Equal(b.Spaces[3].ZoneIDs, []string{"h7"}) || b.Spaces[3].Modifier.Dice[0].Value != 1 || b.Spaces[4].ID != "cleaner-a" || b.Spaces[4].Type != "pawn" || !slices.Equal(b.Spaces[4].ZoneIDs, []string{"h5", "h6"}) || b.Spaces[4].Capacity != domain.UnlimitedCapacity || b.Spaces[4].DisplayShape != "circle" {
		t.Fatal("printed spaces")
	}
	if !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"upper-right"}, {"two"}, {"cleaner-a"}, {"cleaner-a"}, {"one"}, {"upper-left"}}) {
		t.Fatal("entrances", b.BoundarySpaces)
	}
	initial := Snapshot(f.s)
	reveal := cleanerAReveal(t, f)
	placed := cleanerAPlace(t, f)
	moved := cleanerAEnter(t, f)
	captured := cleanerACapture(t, f, f.actor, "worm")
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": Snapshot(f.s), "options": options, "view": view, "finished": Snapshot(f.s), "events": [][]EngineEvent{reveal.Events, placed.Events, moved.Events, captured.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "cleaner-a.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Cleaner A shared evidence mismatch")
	}
}
func TestCleanerAEveryEntranceCanFaceCoreAndPreviewsPreservePaidReveal(t *testing.T) {
	f := cleanerAFixture(t)
	cleanerAReveal(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			ids = append(ids, a.OptionID)
		}
	}
	if !slices.Equal(ids, []string{"place:0:0", "place:0:1", "place:0:2", "place:0:3", "place:0:4", "place:0:5"}) {
		t.Fatal("six entrances", ids)
	}
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("preview state/RNG")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:9"})
	if !slices.Contains(f.s.Discard, "dj") || f.s.PendingChoice.BlockID != "cleaner-a" {
		t.Fatal("rejected placement undid reveal/payment")
	}
}
func TestCleanerAPlacementDeploysNothingAndCaptureUsesTheOnePhysicalPawn(t *testing.T) {
	f := cleanerAFixture(t)
	before := cleanerACards(f)
	cleanerAReveal(t, f)
	cleanerAPlace(t, f)
	if !slices.Contains(f.s.Reserve, "cleaner-a") || f.s.Cybernet.PawnByID("cleaner-a") != nil {
		t.Fatal("placement deployed a pawn")
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "cleaner-a" && (card.Zone != "common" || card.OwnerID != "") {
			t.Fatal("card left common", card)
		}
	}
	cleanerAEnter(t, f)
	r := cleanerACapture(t, f, f.actor, "worm")
	pawn := f.s.Cybernet.PawnByID("cleaner-a")
	if pawn == nil || pawn.OwnerID != "p1" || pawn.Coord != (domain.Coord{Q: 1, R: 0}) || pawn.SpaceID != "cleaner-a" || slices.Contains(f.s.Reserve, "cleaner-a") {
		t.Fatal("capture", pawn)
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "cleaner-a" && (card.Zone != "control" || card.OwnerID != "p1") {
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
	if changed < 0 || placed < 0 || changed > placed || !slices.Equal(cleanerACards(f), before) {
		t.Fatal("timing or inventory", changed, placed)
	}
}
func TestCleanerADefenseFacesAndBothArrowsFollowPrintedSpaces(t *testing.T) {
	f := cleanerAFixture(t)
	cleanerAReveal(t, f)
	cleanerAPlace(t, f)
	cleanerAEnter(t, f)
	if !slices.Equal(cleanerASteps(f, "upper-left"), []string{"core", "one", "upper-right"}) {
		t.Fatal("upper-left", cleanerASteps(f, "upper-left"))
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAAt("one")}})
	if !slices.Equal(cleanerASteps(f, "one"), []string{"cleaner-a", "upper-left"}) {
		t.Fatal("one", cleanerASteps(f, "one"))
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAAt("cleaner-a")}})
	if slices.Contains(cleanerASteps(f, "cleaner-a"), "one") || !slices.Contains(cleanerASteps(f, "cleaner-a"), "two") {
		t.Fatal("home", cleanerASteps(f, "cleaner-a"))
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAAt("one")}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAAt("two")}})
	if !slices.Equal(cleanerASteps(f, "two"), []string{"cleaner-a", "upper-right"}) {
		t.Fatal("two", cleanerASteps(f, "two"))
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAAt("upper-right")}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-3", Path: []SpaceRef{cleanerAAt("two")}})
	held := cleanerAFixture(t)
	cleanerAReveal(t, held)
	cleanerAPlace(t, held)
	cleanerAEnter(t, held)
	cleanerACapture(t, held, held.actor, "worm")
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-a", CardID: "move-1", Path: []SpaceRef{cleanerAAt("two")}})
	faces, err := DefenseProfile(held.s, held.gd, held.s.Cybernet.PawnByID("cleaner-a"))
	open := []int{}
	for _, d := range faces {
		if !d.Shielded {
			open = append(open, d.Value)
		}
	}
	if err != nil || !slices.Equal(open, []int{2, 4, 5, 6}) {
		t.Fatal("face 2", open, err)
	}
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-a", CardID: "move-3", Path: []SpaceRef{cleanerAAt("upper-right"), cleanerAAt("upper-left"), cleanerAAt("one")}})
	faces, err = DefenseProfile(held.s, held.gd, held.s.Cybernet.PawnByID("cleaner-a"))
	open = nil
	for _, d := range faces {
		if !d.Shielded {
			open = append(open, d.Value)
		}
	}
	if err != nil || !slices.Equal(open, []int{1, 4, 5, 6}) {
		t.Fatal("face 1", open, err)
	}
}
func TestCleanerACardMovementAndTwoSkullDeleteSpendACard(t *testing.T) {
	f := cleanerAFixture(t)
	cleanerAReveal(t, f)
	cleanerAPlace(t, f)
	cleanerAEnter(t, f)
	cleanerACapture(t, f, f.actor, "worm")
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAAt("one")}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "cleaner-a", Path: []SpaceRef{}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-a", CardID: "move-3", Path: []SpaceRef{cleanerAAt("two"), cleanerAAt("upper-right"), cleanerAAt("upper-left")}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-a", CardID: "move-2", Path: []SpaceRef{{SpaceID: "core"}}})
	if f.s.Cybernet.PawnByID("cleaner-a").SpaceID != "core" {
		t.Fatal("card movement")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "cleaner-a"})
	f.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-a", CardID: "move-1"})
	skulls := 0
	for _, e := range rolled.Events {
		if e.Type == "roll" {
			skulls = len(e.Roll)
		}
	}
	if skulls != 2 || !slices.Contains(f.s.PlayedCards, "move-1") {
		t.Fatal("two skulls", skulls, f.s.PlayedCards)
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target, f.target}})
	if f.s.Cybernet.PawnByID(f.target) != nil {
		t.Fatal("target survived")
	}
	for _, action := range []Action{{Type: ActPlaySearch, PawnID: "cleaner-a", CardID: "move-2"}, {Type: ActPlayReboot, PawnID: "cleaner-a", CardID: "move-2"}, {Type: ActPlayIcebreakBlk, PawnID: "cleaner-a", CardID: "move-2", Coord: &domain.Coord{Q: 1, R: 0}}} {
		restrictionReject(t, f.s, f.gd, action)
	}
}
func TestCleanerAWeaponAttachmentRefundsOnTakeoverAndStaysForSameController(t *testing.T) {
	f := cleanerAFixture(t)
	cleanerAReveal(t, f)
	cleanerAPlace(t, f)
	cleanerAEnter(t, f)
	cleanerACapture(t, f, f.actor, "worm")
	f.take(t, 0, "servocanon")
	slots := []string{}
	for _, slot := range PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID("cleaner-a")) {
		slots = append(slots, slot.Slot)
	}
	if !slices.Equal(slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal(slots)
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActAttachPawn, TargetID: "cleaner-a", CardID: "servocanon"})
	f.s.Players[0].BonusCounters = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-a", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	if f.s.Players[0].BonusCounters != 0 {
		t.Fatal("cost")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAAt("one")}})
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: "upper-left"}}})
	cleanerACapture(t, f, f.target, "move-1")
	taken := f.s.Cybernet.PawnByID("cleaner-a")
	if taken == nil || taken.OwnerID != "p2" || taken.SpaceID != "cleaner-a" || len(taken.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("takeover", taken, f.s.Players[0].BonusCounters)
	}
	again := cleanerAFixture(t)
	cleanerAReveal(t, again)
	cleanerAPlace(t, again)
	cleanerAEnter(t, again)
	cleanerACapture(t, again, again.actor, "worm")
	again.s.Players[0].BonusCounters = 1
	antroAccept(t, again, Action{Type: ActAttachPawn, TargetID: "cleaner-a", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	block := again.s.Cybernet.At(domain.Coord{Q: 1, R: 0})
	block.OwnerID = "p2"
	again.s.Players[0].ControlMarkersPlaced = 0
	again.s.Players[1].ControlMarkersPlaced = 1
	cleanerACapture(t, again, again.actor, "move-2")
	kept := again.s.Cybernet.PawnByID("cleaner-a")
	if kept.OwnerID != "p1" || len(kept.Attachments) != 1 || again.s.Players[0].BonusCounters != 0 {
		t.Fatal("same controller", kept, again.s.Players[0].BonusCounters)
	}
}
func TestCleanerAMissingPieceRejectsAndLastMarkerVictoryDeploysNothing(t *testing.T) {
	f := cleanerAFixture(t)
	cleanerAReveal(t, f)
	cleanerAPlace(t, f)
	cleanerAEnter(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "cleaner-a" })
	f.s.RNG = domain.NewRNG(5)
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1, R: 0}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") || f.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID != "" {
		t.Fatal("rollback")
	}
	won := cleanerAFixture(t)
	cleanerAReveal(t, won)
	cleanerAPlace(t, won)
	cleanerAEnter(t, won)
	won.s.Players[0].ControlMarkersTotal = 1
	cleanerACapture(t, won, won.actor, "worm")
	if won.s.WinnerID != "p1" || !slices.Contains(won.s.Reserve, "cleaner-a") || won.s.Cybernet.PawnByID("cleaner-a") != nil {
		t.Fatal("victory", won.s.WinnerID)
	}
}
func TestCleanerAStrictSourceConstructionAcceptsTheSharedHandler(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "cleaner-a" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "cleaner-a" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "cleaner-a" })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "cleaner-a") {
		t.Fatal(err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "cleaner-a" })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "control card") {
		t.Fatal(err)
	}
	full, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	base, err := NewGame(Config{Data: full, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(CloneState(base).Reserve, "cleaner-a") {
		t.Fatal("clone")
	}
}
