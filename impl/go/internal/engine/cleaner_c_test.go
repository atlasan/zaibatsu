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

func cleanerCFixture(t *testing.T) malwareFixture {
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
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "cleaner-c" })
	s.BlockPile = append(s.BlockPile, "cleaner-c")
	return f
}
func cleanerCAt(space string) SpaceRef {
	return SpaceRef{Coord: domain.Coord{Q: 1, R: 0}, SpaceID: space}
}
func cleanerCReveal(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func cleanerCPlace(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:4"})
}
func cleanerCEnter(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerCAt("upper-left")}})
}
func cleanerCCapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	t.Helper()
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1, R: 0}})
}
func cleanerCSteps(f malwareFixture, space string) []string {
	out := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1, R: 0}, space, f.actor) {
		out = append(out, ref.SpaceID)
	}
	slices.Sort(out)
	return out
}

func TestCleanerCBilingualGeometryCaptureAndSharedByteEvidence(t *testing.T) {
	f := cleanerCFixture(t)
	b, _ := f.gd.BlockByID("cleaner-c")
	p, _ := f.gd.PawnByID("cleaner-c")
	if b.IceValue != domain.IceHigh || !slices.Equal(b.IceFaces, []int{6}) || b.BlackIce || slices.Contains(b.Edges, false) || b.BonusFragments != 1 || !reflect.DeepEqual(b.BonusCorners, []bool{true, false, false, false, false, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.SpaceArrows) != 2 || b.SpaceArrows[0].From != "two" || b.SpaceArrows[0].To != "upper-left" || b.SpaceArrows[1].From != "hand" || b.SpaceArrows[1].To != "right" || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "cleaner-c" || b.Provisional || len(p.Class) != 0 || len(p.IceFaces) != 0 || p.Movement.Type != "steps" || p.Movement.Activation != "card" || len(p.Abilities) != 1 || p.Abilities[0].Skulls != 2 || !slices.Equal(p.Slots, []string{"add-on", "weapon", "armor"}) {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 2) {
			t.Fatal("printed defense")
		}
	}
	if len(b.Spaces) != 5 || b.Spaces[0].ID != "upper-left" || b.Spaces[1].ID != "hand" || b.Spaces[1].Modifier == nil || b.Spaces[1].Modifier.Kind != "hand-size" || b.Spaces[1].Modifier.Amount != -1 || b.Spaces[2].ID != "right" || b.Spaces[3].ID != "two" || b.Spaces[3].Modifier.Dice[0].Value != 2 || b.Spaces[3].Modifier.Dice[0].Shielded || b.Spaces[4].ID != "cleaner-c" || b.Spaces[4].Capacity != domain.UnlimitedCapacity {
		t.Fatal("printed spaces")
	}
	if !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"hand"}, {"right"}, {"cleaner-c"}, {"cleaner-c"}, {"two"}, {"upper-left"}}) {
		t.Fatal("entrances", b.BoundarySpaces)
	}
	fresh := cleanerCFixture(t)
	initial := Snapshot(fresh.s)
	reveal := cleanerCReveal(t, f)
	placed := cleanerCPlace(t, f)
	moved := cleanerCEnter(t, f)
	captured := cleanerCCapture(t, f, f.actor, "worm")
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": Snapshot(f.s), "options": options, "view": view, "events": [][]EngineEvent{reveal.Events, placed.Events, moved.Events, captured.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "cleaner-c.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Cleaner C shared evidence mismatch")
	}
}
func TestCleanerCEveryEntranceCanFaceCore(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
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
func TestCleanerCPlacementDeploysNothingAndCaptureUsesTheOnePhysicalPawn(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
	cleanerCPlace(t, f)
	if !slices.Contains(f.s.Reserve, "cleaner-c") || f.s.Cybernet.PawnByID("cleaner-c") != nil {
		t.Fatal("placement deployed a pawn")
	}
	cleanerCEnter(t, f)
	r := cleanerCCapture(t, f, f.actor, "worm")
	pawn := f.s.Cybernet.PawnByID("cleaner-c")
	if pawn == nil || pawn.OwnerID != "p1" || pawn.SpaceID != "cleaner-c" || slices.Contains(f.s.Reserve, "cleaner-c") {
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
func TestCleanerCHandLimitDefenseAndArrows(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
	cleanerCPlace(t, f)
	cleanerCEnter(t, f)
	profile, err := HandSizeProfileFor(f.s, f.gd, "p1")
	if err != nil || profile.Spaces != 0 || !slices.Equal(cleanerCSteps(f, "upper-left"), []string{"core", "hand"}) {
		t.Fatal("upper-left", profile, cleanerCSteps(f, "upper-left"), err)
	}
	antroReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerCAt("two")}})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerCAt("hand")}})
	profile, err = HandSizeProfileFor(f.s, f.gd, "p1")
	other, otherErr := HandSizeProfileFor(f.s, f.gd, "p2")
	if err != nil || otherErr != nil || profile.Spaces != -1 || profile.Maximum != 4 || other.Spaces != 0 || !slices.Equal(cleanerCSteps(f, "hand"), []string{"right", "upper-left"}) {
		t.Fatal("hand", profile, other, cleanerCSteps(f, "hand"), err)
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{cleanerCAt("right")}})
	if !slices.Equal(cleanerCSteps(f, "right"), []string{"cleaner-c"}) {
		t.Fatal("right", cleanerCSteps(f, "right"))
	}
	antroReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerCAt("hand")}})
	held := cleanerCFixture(t)
	cleanerCReveal(t, held)
	cleanerCPlace(t, held)
	cleanerCEnter(t, held)
	cleanerCCapture(t, held, held.actor, "worm")
	antroAccept(t, held, Action{Type: ActPlayMove, PawnID: "cleaner-c", CardID: "move-2", Path: []SpaceRef{cleanerCAt("two")}})
	faces, err := DefenseProfile(held.s, held.gd, held.s.Cybernet.PawnByID("cleaner-c"))
	open := []int{}
	for _, d := range faces {
		if !d.Shielded {
			open = append(open, d.Value)
		}
	}
	if err != nil || !slices.Equal(open, []int{2, 3, 4, 5, 6}) || !slices.Equal(cleanerCSteps(held, "two"), []string{"cleaner-c", "upper-left"}) {
		t.Fatal("face 2", open, cleanerCSteps(held, "two"), err)
	}
}
func TestCleanerCCardMovementAndTwoSkullDelete(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
	cleanerCPlace(t, f)
	cleanerCEnter(t, f)
	cleanerCCapture(t, f, f.actor, "worm")
	antroReject(t, f, Action{Type: ActMoveSteps, PawnID: "cleaner-c"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "cleaner-c", CardID: "move-3", Path: []SpaceRef{cleanerCAt("two"), cleanerCAt("upper-left"), {SpaceID: "core"}}})
	if f.s.Cybernet.PawnByID("cleaner-c").SpaceID != "core" {
		t.Fatal("card movement")
	}
	antroReject(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-c"})
	f.s.RNG = domain.NewRNG(5)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "cleaner-c", CardID: "move-1"})
	skulls := 0
	for _, e := range rolled.Events {
		if e.Type == "roll" {
			skulls = len(e.Roll)
		}
	}
	if skulls != 2 || !slices.Contains(f.s.PlayedCards, "move-1") {
		t.Fatal("two skulls", skulls)
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target, f.target}})
	if f.s.Cybernet.PawnByID(f.target) != nil {
		t.Fatal("target survived")
	}
	for _, action := range []Action{{Type: ActSearch, PawnID: "cleaner-c"}, {Type: ActReboot, PawnID: "cleaner-c"}, {Type: ActIcebreakBlk, PawnID: "cleaner-c", Coord: &domain.Coord{Q: 1, R: 0}}} {
		antroReject(t, f, action)
	}
}
func TestCleanerCWeaponRefundsOnTakeoverAndStaysForSameController(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
	cleanerCPlace(t, f)
	cleanerCEnter(t, f)
	cleanerCCapture(t, f, f.actor, "worm")
	f.take(t, 0, "servocanon")
	antroReject(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-c", CardID: "servocanon"})
	f.s.Players[0].BonusCounters = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "cleaner-c", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{cleanerCAt("hand")}})
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-1", Path: []SpaceRef{cleanerCAt("upper-left")}})
	cleanerCCapture(t, f, f.target, "move-1")
	taken := f.s.Cybernet.PawnByID("cleaner-c")
	if taken == nil || taken.OwnerID != "p2" || len(taken.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("takeover", taken)
	}
	again := cleanerCFixture(t)
	cleanerCReveal(t, again)
	cleanerCPlace(t, again)
	cleanerCEnter(t, again)
	cleanerCCapture(t, again, again.actor, "worm")
	again.s.Players[0].BonusCounters = 1
	antroAccept(t, again, Action{Type: ActAttachPawn, TargetID: "cleaner-c", CardID: "ak-12km", SlotRef: "pawn:weapon"})
	again.s.Cybernet.At(domain.Coord{Q: 1, R: 0}).OwnerID = "p2"
	again.s.Players[0].ControlMarkersPlaced = 0
	again.s.Players[1].ControlMarkersPlaced = 1
	cleanerCCapture(t, again, again.actor, "move-2")
	kept := again.s.Cybernet.PawnByID("cleaner-c")
	if kept.OwnerID != "p1" || len(kept.Attachments) != 1 {
		t.Fatal("same controller", kept)
	}
}
func TestCleanerCMissingPieceRejectsAndLastMarkerVictoryDeploysNothing(t *testing.T) {
	f := cleanerCFixture(t)
	cleanerCReveal(t, f)
	cleanerCPlace(t, f)
	cleanerCEnter(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "cleaner-c" })
	f.s.RNG = domain.NewRNG(5)
	antroReject(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1, R: 0}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") {
		t.Fatal("rollback")
	}
	won := cleanerCFixture(t)
	cleanerCReveal(t, won)
	cleanerCPlace(t, won)
	cleanerCEnter(t, won)
	won.s.Players[0].ControlMarkersTotal = 1
	cleanerCCapture(t, won, won.actor, "worm")
	if won.s.WinnerID != "p1" || !slices.Contains(won.s.Reserve, "cleaner-c") || won.s.Cybernet.PawnByID("cleaner-c") != nil {
		t.Fatal("victory", won.s.WinnerID)
	}
}
func TestCleanerCStrictSourceConstructionRejectsAMissingControlCard(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "cleaner-c" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "cleaner-c" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "cleaner-c" })
	gd.Cards = nil
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "cleaner-c") {
		t.Fatal(err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "cleaner-c" })
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
	if !slices.Contains(CloneState(base).Reserve, "cleaner-c") {
		t.Fatal("clone")
	}
}
