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

func cleanerFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "move-1", "move-2", "move-3", "worm", "ak-12km"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "move-1"} {
		f.take(t, 1, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "cleaner-b" })
	s.BlockPile = append(s.BlockPile, "cleaner-b")
	return f
}
func cleanerAt(space string) SpaceRef {
	return SpaceRef{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: space}
}
func cleanerReveal(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func cleanerPlace(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:4"})
}
func cleanerEnter(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAt("hand")}})
}
func cleanerCapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	t.Helper()
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1, R: 0}})
}
func cleanerCards(f malwareFixture) []string {
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
func TestCleanerBBilingualGeometryCaptureHandLimitAndSharedByteEvidence(t *testing.T) {
	f := cleanerFixture(t)
	b, _ := f.gd.BlockByID("cleaner-b")
	p, _ := f.gd.PawnByID("cleaner-b")
	if b.IceValue != domain.IceHigh || !slices.Equal(b.IceFaces, []int{6}) || slices.Contains(b.Edges, false) || b.BonusFragments != 1 || !reflect.DeepEqual(b.BonusCorners, []bool{false, false, true, false, false, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.SpaceArrows) != 1 || b.SpaceArrows[0].From != "hand" || b.SpaceArrows[0].To != "circuit" || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "cleaner-b" || len(p.Class) != 0 || len(p.IceFaces) != 0 || p.Movement.Type != "steps" || p.Movement.Steps != 0 || p.Movement.Activation != "card" || len(p.Abilities) != 1 || p.Abilities[0].Ability != "delete" || p.Abilities[0].Activation != "card" || p.Abilities[0].Skulls != 1 || !slices.Equal(p.Slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 4) {
			t.Fatal("printed defense")
		}
	}
	if len(b.Spaces) != 5 || b.Spaces[0].ID != "hand" || !slices.Equal(b.Spaces[0].ZoneIDs, []string{"h2"}) || b.Spaces[0].Capacity != 1 || b.Spaces[0].Modifier == nil || b.Spaces[0].Modifier.Kind != "hand-size" || b.Spaces[0].Modifier.Amount != -1 || b.Spaces[1].ID != "circuit" || !slices.Equal(b.Spaces[1].ZoneIDs, []string{"h3"}) || b.Spaces[2].ID != "defense" || !slices.Equal(b.Spaces[2].ZoneIDs, []string{"h4"}) || b.Spaces[2].Modifier == nil || b.Spaces[2].Modifier.Kind != "defense" || len(b.Spaces[2].Modifier.Dice) != 2 || b.Spaces[2].Modifier.Dice[0].Shielded || b.Spaces[2].Modifier.Dice[1].Value != 2 || b.Spaces[3].ID != "left" || !slices.Equal(b.Spaces[3].ZoneIDs, []string{"h7"}) || b.Spaces[4].ID != "cleaner-b" || b.Spaces[4].Type != "pawn" || !slices.Equal(b.Spaces[4].ZoneIDs, []string{"h5", "h6"}) || b.Spaces[4].Capacity != domain.UnlimitedCapacity || b.Spaces[4].DisplayShape != "circle" {
		t.Fatal("printed spaces")
	}
	if !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"circuit"}, {"defense"}, {"cleaner-b"}, {"cleaner-b"}, {"left"}, {"hand"}}) {
		t.Fatal("entrances", b.BoundarySpaces)
	}
	initial := Snapshot(f.s)
	reveal := cleanerReveal(t, f)
	placed := cleanerPlace(t, f)
	moved := cleanerEnter(t, f)
	captured := cleanerCapture(t, f, f.actor, "worm")
	controlled := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": controlled, "options": options, "view": view, "finished": Snapshot(f.s), "events": [][]EngineEvent{reveal.Events, placed.Events, moved.Events, captured.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "cleaner-b.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Cleaner B shared evidence mismatch")
	}
}
func TestCleanerBEveryEntranceCanFaceCoreAndPreviewsPreservePaidReveal(t *testing.T) {
	f := cleanerFixture(t)
	cleanerReveal(t, f)
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
	if !slices.Contains(f.s.Discard, "dj") || f.s.PendingChoice.BlockID != "cleaner-b" {
		t.Fatal("rejected placement undid reveal/payment")
	}
}
func TestCleanerBPlacementDeploysNothingAndCaptureUsesTheOnePhysicalPawn(t *testing.T) {
	f := cleanerFixture(t)
	before := cleanerCards(f)
	cleanerReveal(t, f)
	cleanerPlace(t, f)
	if !slices.Contains(f.s.Reserve, "cleaner-b") || f.s.Cybernet.PawnByID("cleaner-b") != nil {
		t.Fatal("placement deployed the pawn")
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "cleaner-b" && (card.Zone != "common" || card.OwnerID != "") {
			t.Fatal("control card moved before capture", card)
		}
	}
	cleanerEnter(t, f)
	captured := cleanerCapture(t, f, f.actor, "worm")
	pawn := f.s.Cybernet.PawnByID("cleaner-b")
	if pawn == nil || pawn.OwnerID != "p1" || pawn.Coord != (domain.Coord{Q: 1, R: 0}) || pawn.SpaceID != "cleaner-b" || slices.Contains(f.s.Reserve, "cleaner-b") {
		t.Fatal("capture placement", pawn)
	}
	found := false
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "cleaner-b" {
			found = card.Zone == "control" && card.OwnerID == "p1"
		}
	}
	if !found {
		t.Fatal("control card not acquired")
	}
	changed, placed := -1, -1
	for i, e := range captured.Events {
		if e.Type == "control-changed" && e.Element == "block" && changed < 0 {
			changed = i
		}
		if e.Type == "pawn-placed" && placed < 0 {
			placed = i
		}
	}
	if changed < 0 || placed < 0 || changed > placed || !slices.Equal(cleanerCards(f), before) {
		t.Fatal("timing or inventory", changed, placed)
	}
}
func TestCleanerBHandDefenseAndArrowFollowPrintedSpaces(t *testing.T) {
	f := cleanerFixture(t)
	cleanerReveal(t, f)
	cleanerPlace(t, f)
	cleanerEnter(t, f)
	hand, err := HandSizeProfileFor(f.s, f.gd, "p1")
	if err != nil || hand.Spaces != -1 {
		t.Fatal("hand limit", hand, err)
	}
	ids := func(space string) []string {
		out := []string{}
		for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1, R: 0}, space, f.actor) {
			out = append(out, ref.SpaceID)
		}
		slices.Sort(out)
		return out
	}
	if !slices.Equal(ids("hand"), []string{"circuit", "core", "left"}) || slices.Contains(ids("circuit"), "hand") {
		t.Fatal("arrow", ids("hand"), ids("circuit"))
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerAt("circuit")}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAt("hand")}})
	cleanerCapture(t, f, f.actor, "worm")
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-b", CardID: "move-3", Path: []SpaceRef{cleanerAt("defense")}})
	hand, err = HandSizeProfileFor(f.s, f.gd, "p1")
	faces, derr := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID("cleaner-b"))
	open := []int{}
	for _, d := range faces {
		if !d.Shielded {
			open = append(open, d.Value)
		}
	}
	if err != nil || derr != nil || hand.Spaces != 0 || !slices.Equal(open, []int{1, 2, 5, 6}) {
		t.Fatal("modifiers", hand, open, err, derr)
	}
}
func TestCleanerBCardMovementAndDeleteSpendCards(t *testing.T) {
	f := cleanerFixture(t)
	cleanerReveal(t, f)
	cleanerPlace(t, f)
	cleanerEnter(t, f)
	cleanerCapture(t, f, f.actor, "worm")
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "cleaner-b", Path: []SpaceRef{cleanerAt("left")}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-b", CardID: "move-3", Path: []SpaceRef{cleanerAt("left"), cleanerAt("hand"), {SpaceID: "core"}}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "cleaner-b"})
	f.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-b", CardID: "move-1"})
	if len(rolled.Events) == 0 || len(rolled.Events[len(rolled.Events)-1].Roll) != 1 {
		t.Fatal("one skull", rolled.Events)
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
	if f.s.Cybernet.PawnByID(f.target) != nil {
		t.Fatal("target survived")
	}
	for _, action := range []Action{{Type: ActPlaySearch, PawnID: "cleaner-b", CardID: "move-2"}, {Type: ActPlayReboot, PawnID: "cleaner-b", CardID: "move-2"}, {Type: ActPlayIcebreakBlk, PawnID: "cleaner-b", CardID: "move-2", Coord: &domain.Coord{Q: 1, R: 0}}} {
		restrictionReject(t, f.s, f.gd, action)
	}
}
func TestCleanerBWeaponAttachmentRefundsOnTakeoverAndStaysForSameController(t *testing.T) {
	f := cleanerFixture(t)
	cleanerReveal(t, f)
	cleanerPlace(t, f)
	cleanerEnter(t, f)
	cleanerCapture(t, f, f.actor, "worm")
	f.take(t, 0, "servocanon")
	slots := []string{}
	for _, slot := range PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID("cleaner-b")) {
		slots = append(slots, slot.Slot)
	}
	if !slices.Equal(slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal("slots", slots)
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActAttachPawn, TargetID: "cleaner-b", CardID: "servocanon"})
	f.s.Players[0].BonusCounters = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-b", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	if f.s.Players[0].BonusCounters != 0 {
		t.Fatal("attachment did not spend the counter")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerAt("circuit")}})
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-1", Path: []SpaceRef{cleanerAt("hand")}})
	cleanerCapture(t, f, f.target, "move-1")
	taken := f.s.Cybernet.PawnByID("cleaner-b")
	if taken == nil || taken.OwnerID != "p2" || taken.SpaceID != "cleaner-b" || len(taken.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("takeover cleanup", taken, f.s.Players[0].BonusCounters)
	}
	again := cleanerFixture(t)
	cleanerReveal(t, again)
	cleanerPlace(t, again)
	cleanerEnter(t, again)
	cleanerCapture(t, again, again.actor, "worm")
	again.s.Players[0].BonusCounters = 1
	antroAccept(t, again, Action{Type: ActAttachPawn, TargetID: "cleaner-b", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	again.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID = "p2"
	again.s.Players[0].ControlMarkersPlaced = 0
	again.s.Players[1].ControlMarkersPlaced = 1
	cleanerCapture(t, again, again.actor, "move-2")
	kept := again.s.Cybernet.PawnByID("cleaner-b")
	if kept == nil || kept.OwnerID != "p1" || len(kept.Attachments) != 1 || again.s.Players[0].BonusCounters != 0 {
		t.Fatal("same controller", kept, again.s.Players[0].BonusCounters)
	}
}
func TestCleanerBMissingPieceRejectsAndLastMarkerVictoryDeploysNothing(t *testing.T) {
	f := cleanerFixture(t)
	cleanerReveal(t, f)
	cleanerPlace(t, f)
	cleanerEnter(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "cleaner-b" })
	f.s.RNG = domain.NewRNG(5)
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1, R: 0}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") || f.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID != "" {
		t.Fatal("failed capture consumed the card or the block")
	}
	won := cleanerFixture(t)
	cleanerReveal(t, won)
	cleanerPlace(t, won)
	cleanerEnter(t, won)
	won.s.Players[0].ControlMarkersTotal = 1
	cleanerCapture(t, won, won.actor, "worm")
	if won.s.WinnerID != "p1" || !slices.Contains(won.s.Reserve, "cleaner-b") {
		t.Fatal("victory deployed the pawn", won.s.WinnerID, won.s.Reserve)
	}
}
func TestCleanerBStrictSourceConstructionAcceptsSharedHandler(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "cleaner-b" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "cleaner-b" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "cleaner-b" })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "cleaner-b") {
		t.Fatal(err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "cleaner-b" })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "control card") {
		t.Fatal(err)
	}
	provisional, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	cloned := CloneState(mustCleanerGame(t, provisional))
	if !slices.Contains(cloned.Reserve, "cleaner-b") {
		t.Fatal("clone dropped the reserve pawn")
	}
}
func mustCleanerGame(t *testing.T, gd *domain.GameData) *domain.GameState {
	t.Helper()
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 1})
	if err != nil {
		t.Fatal(err)
	}
	return s
}
