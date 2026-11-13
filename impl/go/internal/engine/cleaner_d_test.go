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

func cleanerDFixture(t *testing.T) malwareFixture {
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
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "cleaner-d" })
	s.BlockPile = append(s.BlockPile, "cleaner-d")
	return f
}
func cleanerDAt(space string) SpaceRef {
	return SpaceRef{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: space}
}
func cleanerDReveal(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func cleanerDPlace(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:4"})
}
func cleanerDEnter(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerDAt("upper-left")}})
}
func cleanerDCapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	t.Helper()
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1, R: 0}})
}
func cleanerDSteps(f malwareFixture, space string) []string {
	out := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1, R: 0}, space, f.actor) {
		out = append(out, ref.SpaceID)
	}
	slices.Sort(out)
	return out
}
func cleanerDOpenFaces(t *testing.T, f malwareFixture, pawn string) []int {
	t.Helper()
	faces, err := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID(pawn))
	if err != nil {
		t.Fatal(err)
	}
	open := []int{}
	for _, d := range faces {
		if !d.Shielded {
			open = append(open, d.Value)
		}
	}
	return open
}

func TestCleanerDBilingualGeometryCaptureAndSharedByteEvidence(t *testing.T) {
	f := cleanerDFixture(t)
	b, _ := f.gd.BlockByID("cleaner-d")
	p, _ := f.gd.PawnByID("cleaner-d")
	if b.IceValue != domain.IceHigh || !slices.Equal(b.IceFaces, []int{6}) || b.BlackIce || slices.Contains(b.Edges, false) || b.BonusFragments != 4 || !reflect.DeepEqual(b.BonusCorners, []bool{true, false, true, false, true, true}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.SpaceArrows) != 2 || b.SpaceArrows[0].From != "skull" || b.SpaceArrows[0].To != "upper-left" || b.SpaceArrows[1].From != "cleaner-d" || b.SpaceArrows[1].To != "right" || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "cleaner-d" || b.Provisional || len(p.Class) != 0 || len(p.IceFaces) != 0 || p.Movement.Type != "steps" || p.Movement.Activation != "card" || len(p.Abilities) != 1 || p.Abilities[0].Skulls != 1 || !slices.Equal(p.Slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 3) {
			t.Fatal("printed defense")
		}
	}
	if len(b.Spaces) != 5 || b.Spaces[0].ID != "upper-left" || b.Spaces[1].ID != "skull" || b.Spaces[1].Modifier == nil || b.Spaces[1].Modifier.Kind != "attack" || b.Spaces[1].Modifier.Amount != 1 || b.Spaces[2].ID != "right" || b.Spaces[3].ID != "one" || b.Spaces[3].Modifier.Dice[0].Value != 1 || b.Spaces[3].Modifier.Dice[0].Shielded || b.Spaces[4].ID != "cleaner-d" || b.Spaces[4].Capacity != domain.UnlimitedCapacity {
		t.Fatal("printed spaces")
	}
	if !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"skull"}, {"right"}, {"cleaner-d"}, {"cleaner-d"}, {"one"}, {"upper-left"}}) {
		t.Fatal("entrances", b.BoundarySpaces)
	}
	fresh := cleanerDFixture(t)
	initial := Snapshot(fresh.s)
	reveal := cleanerDReveal(t, f)
	placed := cleanerDPlace(t, f)
	moved := cleanerDEnter(t, f)
	captured := cleanerDCapture(t, f, f.actor, "worm")
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": Snapshot(f.s), "options": options, "view": view, "events": [][]EngineEvent{reveal.Events, placed.Events, moved.Events, captured.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "cleaner-d.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Cleaner D shared evidence mismatch")
	}
}
func TestCleanerDEveryEntranceCanFaceCore(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			ids = append(ids, a.OptionID)
		}
	}
	if !slices.Equal(ids, []string{"place:0:0", "place:0:1", "place:0:2", "place:0:3", "place:0:4", "place:0:5"}) {
		t.Fatal("six entrances", ids)
	}
}
func TestCleanerDPlacementDeploysNothingAndCaptureUsesTheOnePhysicalPawn(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	cleanerDPlace(t, f)
	if !slices.Contains(f.s.Reserve, "cleaner-d") || f.s.Cybernet.PawnByID("cleaner-d") != nil {
		t.Fatal("placement deployed a pawn")
	}
	cleanerDEnter(t, f)
	r := cleanerDCapture(t, f, f.actor, "worm")
	pawn := f.s.Cybernet.PawnByID("cleaner-d")
	if pawn == nil || pawn.OwnerID != "p1" || pawn.SpaceID != "cleaner-d" || slices.Contains(f.s.Reserve, "cleaner-d") {
		t.Fatal("capture", pawn)
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
	if changed < 0 || placed < 0 || changed > placed {
		t.Fatal("timing", changed, placed)
	}
}
func TestCleanerDDefenseFaceSkullSpaceAndArrows(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	cleanerDPlace(t, f)
	cleanerDEnter(t, f)
	if !slices.Equal(cleanerDSteps(f, "upper-left"), []string{"core", "one"}) {
		t.Fatal("upper-left", cleanerDSteps(f, "upper-left"))
	}
	antroReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerDAt("skull")}})
	held := cleanerDFixture(t)
	cleanerDReveal(t, held)
	cleanerDPlace(t, held)
	cleanerDEnter(t, held)
	cleanerDCapture(t, held, held.actor, "worm")
	if !slices.Equal(cleanerDSteps(held, "cleaner-d"), []string{"one", "right"}) {
		t.Fatal("home", cleanerDSteps(held, "cleaner-d"))
	}
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-d", CardID: "move-1", Path: []SpaceRef{cleanerDAt("one")}})
	if !slices.Equal(cleanerDOpenFaces(t, held, "cleaner-d"), []int{1, 4, 5, 6}) || !slices.Equal(cleanerDSteps(held, "one"), []string{"cleaner-d", "upper-left"}) {
		t.Fatal("face 1", cleanerDOpenFaces(t, held, "cleaner-d"), cleanerDSteps(held, "one"))
	}
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-d", CardID: "move-2", Path: []SpaceRef{cleanerDAt("cleaner-d"), cleanerDAt("right")}})
	if !slices.Equal(cleanerDSteps(held, "right"), []string{"skull"}) {
		t.Fatal("right", cleanerDSteps(held, "right"))
	}
	antroReject(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-d", CardID: "move-1", Path: []SpaceRef{cleanerDAt("cleaner-d")}})
	if !slices.Equal(cleanerDOpenFaces(t, held, "cleaner-d"), []int{4, 5, 6}) {
		t.Fatal("printed faces", cleanerDOpenFaces(t, held, "cleaner-d"))
	}
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: held.actor, CardID: "move-3", Path: []SpaceRef{{SpaceID: "core"}}})
	held.s.CurrentPlayer = 1
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: held.target, CardID: "move-1", Path: []SpaceRef{cleanerDAt("upper-left")}})
	held.s.CurrentPlayer = 0
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-d", CardID: "move-1", Path: []SpaceRef{cleanerDAt("skull")}})
	held.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, held, Action{Type: ActRollDelete, PawnID: "cleaner-d", CardID: "move-2"})
	skulls := 0
	for _, e := range rolled.Events {
		if e.Type == "roll" {
			skulls = len(e.Roll)
		}
	}
	if skulls != 2 {
		t.Fatal("skull space", skulls)
	}
}
func TestCleanerDCardMovementAndOneSkullDelete(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	cleanerDPlace(t, f)
	cleanerDEnter(t, f)
	cleanerDCapture(t, f, f.actor, "worm")
	antroReject(t, f, Action{Type: ActMoveSteps, PawnID: "cleaner-d"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-d", CardID: "move-3", Path: []SpaceRef{cleanerDAt("one"), cleanerDAt("upper-left"), {SpaceID: "core"}}})
	if f.s.Cybernet.PawnByID("cleaner-d").SpaceID != "core" {
		t.Fatal("card movement")
	}
	antroReject(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-d"})
	f.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-d", CardID: "move-1"})
	skulls := 0
	for _, e := range rolled.Events {
		if e.Type == "roll" {
			skulls = len(e.Roll)
		}
	}
	if skulls != 1 || !slices.Contains(f.s.PlayedCards, "move-1") {
		t.Fatal("one skull", skulls)
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
	if f.s.Cybernet.PawnByID(f.target) != nil {
		t.Fatal("target survived")
	}
	for _, action := range []Action{{Type: ActSearch, PawnID: "cleaner-d"}, {Type: ActReboot, PawnID: "cleaner-d"}, {Type: ActIcebreakBlk, PawnID: "cleaner-d", Coord: &domain.Coord{Q: 1, R: 0}}} {
		antroReject(t, f, action)
	}
}
func TestCleanerDWeaponRefundsOnTakeoverAndStaysForSameController(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	cleanerDPlace(t, f)
	cleanerDEnter(t, f)
	cleanerDCapture(t, f, f.actor, "worm")
	f.take(t, 0, "servocanon")
	antroReject(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-d", CardID: "servocanon"})
	f.s.Players[0].BonusCounters = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-d", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerDAt("one")}})
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-1", Path: []SpaceRef{cleanerDAt("upper-left")}})
	cleanerDCapture(t, f, f.target, "move-1")
	taken := f.s.Cybernet.PawnByID("cleaner-d")
	if taken == nil || taken.OwnerID != "p2" || len(taken.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("takeover", taken)
	}
	again := cleanerDFixture(t)
	cleanerDReveal(t, again)
	cleanerDPlace(t, again)
	cleanerDEnter(t, again)
	cleanerDCapture(t, again, again.actor, "worm")
	again.s.Players[0].BonusCounters = 1
	antroAccept(t, again, Action{Type: ActAttachPawn, TargetID: "cleaner-d", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	again.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID = "p2"
	again.s.Players[0].ControlMarkersPlaced = 0
	again.s.Players[1].ControlMarkersPlaced = 1
	cleanerDCapture(t, again, again.actor, "move-2")
	kept := again.s.Cybernet.PawnByID("cleaner-d")
	if kept.OwnerID != "p1" || len(kept.Attachments) != 1 {
		t.Fatal("same controller", kept)
	}
}
func TestCleanerDMissingPieceRejectsAndLastMarkerVictoryDeploysNothing(t *testing.T) {
	f := cleanerDFixture(t)
	cleanerDReveal(t, f)
	cleanerDPlace(t, f)
	cleanerDEnter(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "cleaner-d" })
	f.s.RNG = domain.NewRNG(5)
	antroReject(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1, R: 0}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") {
		t.Fatal("rollback")
	}
	won := cleanerDFixture(t)
	cleanerDReveal(t, won)
	cleanerDPlace(t, won)
	cleanerDEnter(t, won)
	won.s.Players[0].ControlMarkersTotal = 1
	cleanerDCapture(t, won, won.actor, "worm")
	if won.s.WinnerID != "p1" || !slices.Contains(won.s.Reserve, "cleaner-d") || won.s.Cybernet.PawnByID("cleaner-d") != nil {
		t.Fatal("victory", won.s.WinnerID)
	}
}
func TestCleanerDStrictSourceConstructionRejectsAMissingControlCard(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "cleaner-d" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "cleaner-d" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "cleaner-d" })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "cleaner-d") {
		t.Fatal(err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "cleaner-d" })
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
	if !slices.Contains(CloneState(base).Reserve, "cleaner-d") {
		t.Fatal("clone")
	}
}
