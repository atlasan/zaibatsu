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

func clinicFixture(t *testing.T, equip bool) malwareFixture {
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
	ids := []string{"dj", "move-2", "worm", "move-1", "move-2"}
	if equip {
		ids = append(ids, "weapon-gunhed", "ak-12km", "phase-loop")
	}
	for _, id := range ids {
		f.take(t, 0, id)
	}
	f.take(t, 1, "dummy")
	amount := 1
	if equip {
		amount = 6
	}
	copyleftGrant(t, s, "p1", amount)
	copyleftGrant(t, s, "p2", 1)
	if equip {
		for _, id := range []string{"weapon-gunhed", "ak-12km", "phase-loop"} {
			antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: f.actor, CardID: id})
		}
	}
	s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: f.target, CardID: "dummy"})
	s.CurrentPlayer = 0
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "black-clinic" })
	s.BlockPile = append(s.BlockPile, "black-clinic")
	return f
}
func clinicPrepare(t *testing.T, f malwareFixture) []TransitionResult {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	c := antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "clinic"}}})
	return []TransitionResult{a, b, c}
}
func clinicCapture(t *testing.T, f malwareFixture) TransitionResult {
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
}
func clinicResponse(f malwareFixture, target string) Action {
	return Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "discard", TargetID: target}
}
func clinicProfile(t *testing.T, f malwareFixture, who string) HandSizeProfile {
	t.Helper()
	p, err := HandSizeProfileFor(f.s, f.gd, who)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func TestBlackClinicBilingualGeometryDecisionsCleanupAndHandRecyclingSharedByteEvidence(t *testing.T) {
	f := clinicFixture(t, true)
	b, _ := f.gd.BlockByID("black-clinic")
	if !slices.Equal(b.IceFaces, []int{3, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, true, true, false, true, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.Spaces) != 5 || b.Spaces[3].Type != "special" || b.Spaces[3].Capacity != domain.UnlimitedCapacity || !reflect.DeepEqual(b.SpaceArrows, []domain.SpaceArrow{{From: "helmet", To: "hand"}}) || b.Effects.UnderControl.Kind != "discard-pawn-attachments" || b.Effects.UnderControl.Scope != "cybernet" {
		t.Fatal("printed source attributes")
	}
	for i, sp := range b.Spaces {
		if i != 3 && sp.Capacity != 1 {
			t.Fatal("printed single")
		}
	}
	initial := Snapshot(f.s)
	p := clinicPrepare(t, f)
	captured := clinicCapture(t, f)
	pending := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	observer, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	removed := antroAccept(t, f, clinicResponse(f, f.actor))
	detached := Snapshot(f.s)
	move := antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}}})
	profile := clinicProfile(t, f, "p1")
	phase := AdvancePhase(f.s, f.gd)
	if !phase.Accepted {
		t.Fatal(phase)
	}
	recycled := antroAccept(t, f, Action{Type: ActRecycle})
	view, err := PlayerView(f.s, f.gd, "")
	if err != nil {
		t.Fatal(err)
	}
	spectator, err := EventsForPlayer(f.s, removed.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "pending": pending, "options": options, "observer": observer, "detached": detached, "profile": profile, "finished": Snapshot(f.s), "view": view, "events": [][]EngineEvent{p[0].Events, p[1].Events, p[2].Events, captured.Events, removed.Events, move.Events, phase.Events, recycled.Events}, "spectator": spectator}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "black-clinic.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Black Clinic shared evidence mismatch", string(raw))
	}
}
func TestBlackClinicPureMandatoryTargetsAndSourceControllerAuthorization(t *testing.T) {
	f := clinicFixture(t, true)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	o := AvailableActions(f.s, f.gd)
	if len(o) != 1 || len(o[0].Responses) != 2 || o[0].Responses[0].TargetID != f.actor || o[0].Responses[1].TargetID != f.target || len(AvailableActions(f.s, f.gd, "p2")) != 0 {
		t.Fatal("source controller targets")
	}
	for _, a := range o[0].Responses {
		if a.OptionID != "discard" {
			t.Fatal("invented decline")
		}
	}
	if _, err := PlayerView(f.s, f.gd, "p2"); err != nil {
		t.Fatal(err)
	}
	cloned := CloneState(f.s)
	cloned.PendingChoice.Reference.Q = 99
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("preview/clone changed state/RNG")
	}
	base := clinicResponse(f, f.actor)
	actions := []Action{base, base, base, base, base, base, base, base, base, {Type: ActPass}}
	actions[0].PlayerID = "p2"
	actions[1].OptionID = "skip"
	actions[2].TargetID = "missing"
	actions[3].CardID = "move-1"
	actions[4].CardIDs = []string{"move-1"}
	actions[5].AttachmentID = "att-1"
	actions[6].ExtraSkulls = 1
	actions[7].TargetIDs = []string{f.actor, f.target}
	actions[8].ChoiceID = "old"
	for _, a := range actions {
		restrictionReject(t, f.s, f.gd, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase bypass")
	}
}
func TestBlackClinicNestedPhysicalCleanupRefundsAndBenefitsWithoutRNG(t *testing.T) {
	f := clinicFixture(t, true)
	cards := sprawlInventory(f.s)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	rng := *f.s.RNG
	hands := [][]string{slices.Clone(f.s.Players[0].Hand), slices.Clone(f.s.Players[1].Hand)}
	played := slices.Clone(f.s.PlayedCards)
	enemy := slices.Clone(f.s.Cybernet.PawnByID(f.target).Attachments)
	markers := []int{f.s.Players[0].ControlMarkersPlaced, f.s.Players[1].ControlMarkersPlaced}
	r := antroAccept(t, f, clinicResponse(f, f.actor))
	after := *f.s.RNG
	pool, err := BonusCounterPool(f.s)
	if err != nil {
		t.Fatal(err)
	}
	if rng.Intn(100000) != after.Intn(100000) || len(f.s.Cybernet.PawnByID(f.actor).Attachments) != 0 || !reflect.DeepEqual(enemy, f.s.Cybernet.PawnByID(f.target).Attachments) || f.s.Players[0].BonusCounters != 6 || f.s.Players[1].BonusCounters != 0 || pool.Invested != 1 || !slices.Equal(played, f.s.PlayedCards) || !slices.Equal(hands[0], f.s.Players[0].Hand) || !slices.Equal(hands[1], f.s.Players[1].Hand) || f.s.Players[0].ControlMarkersPlaced != markers[0] || f.s.Players[1].ControlMarkersPlaced != markers[1] || !slices.Equal(cards, sprawlInventory(f.s)) || f.s.PendingChoice != nil {
		t.Fatal("physical cleanup changed other zones")
	}
	ids := []string{}
	for _, e := range r.Events {
		if e.Type == "card-discarded" {
			ids = append(ids, e.CardID)
		}
		if e.Type == EventElimination {
			t.Fatal("discard eliminated pawn")
		}
	}
	refs := []string{}
	for _, slot := range PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID(f.actor)) {
		refs = append(refs, slot.Ref)
	}
	if !slices.Equal(ids, []string{"weapon-gunhed", "ak-12km", "phase-loop"}) || !slices.Equal(refs, []string{"pawn:add-on", "pawn:gadget", "pawn:armor"}) || !reflect.DeepEqual(EffectiveIcebreakerModifier(f.gd, f.s.Cybernet.PawnByID(f.actor)), EffectiveIcebreakerModifier(f.gd, &domain.PawnOnBoard{PawnID: f.actor})) {
		t.Fatal("cleanup benefits/receipts")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: "old", OptionID: "discard", TargetID: f.actor})
}
func TestBlackClinicEnemyDummyDiscardDoesNotOfferEliminationPrevention(t *testing.T) {
	f := clinicFixture(t, true)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	own := slices.Clone(f.s.Cybernet.PawnByID(f.actor).Attachments)
	r := antroAccept(t, f, clinicResponse(f, f.target))
	ids := []string{}
	for _, e := range r.Events {
		if e.Type == "card-discarded" {
			ids = append(ids, e.CardID)
		}
	}
	if len(f.s.Cybernet.PawnByID(f.target).Attachments) != 0 || !reflect.DeepEqual(own, f.s.Cybernet.PawnByID(f.actor).Attachments) || f.s.Players[1].BonusCounters != 1 || f.s.PendingChoice != nil || len(f.s.Eliminated) != 0 || !slices.Equal(ids, []string{"dummy"}) {
		t.Fatal("non-elimination target cleanup")
	}
}
func TestBlackClinicNeutralDistantEmptyTargetsAndRetainedExclusion(t *testing.T) {
	for _, kind := range []string{"neutral", "distant", "empty"} {
		f := clinicFixture(t, false)
		if kind == "neutral" {
			f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
			f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", SpaceID: "core"})
		}
		if kind == "distant" {
			f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "pink-district", Coord: domain.Coord{Q: 5}, Rotation: 3})
			f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(id string) bool { return id == "pink-district" })
			f.s.Cybernet.PawnByID(f.target).Coord = domain.Coord{Q: 5}
			f.s.Cybernet.PawnByID(f.target).SpaceID = "gynoid"
		}
		clinicPrepare(t, f)
		clinicCapture(t, f)
		id := f.actor
		if kind == "neutral" {
			id = "gynoid"
		}
		if kind == "distant" {
			id = f.target
		}
		if !slices.ContainsFunc(AvailableActions(f.s, f.gd)[0].Responses, func(a Action) bool { return a.TargetID == id }) {
			t.Fatal("literal global pawn excluded", kind)
		}
		rng := *f.s.RNG
		antroAccept(t, f, clinicResponse(f, id))
		after := *f.s.RNG
		if rng.Intn(100000) != after.Intn(100000) {
			t.Fatal("discard used RNG")
		}
	}
	f := clinicFixture(t, false)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	f.s.Cybernet.RemovePawn(f.target)
	f.s.Eliminated = append(f.s.Eliminated, f.target)
	o := AvailableActions(f.s, f.gd)[0].Responses
	if len(o) != 1 || o[0].TargetID != f.actor {
		t.Fatal("retained target")
	}
	restrictionReject(t, f.s, f.gd, clinicResponse(f, f.target))
	antroAccept(t, f, clinicResponse(f, f.actor))
}
func TestBlackClinicSpentDiscardMetadataPreservedAndReuseRemainsGated(t *testing.T) {
	f := clinicFixture(t, true)
	var id string
	for i := range f.s.Cybernet.PawnByID(f.actor).Attachments {
		att := &f.s.Cybernet.PawnByID(f.actor).Attachments[i]
		if att.CardID == "ak-12km" {
			att.UseMarkers = []domain.UseMarker{{Ability: "delete", Uses: 1}}
			id = att.InstanceID
		}
	}
	cards := sprawlInventory(f.s)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, f.actor))
	if len(f.s.UnresolvedUseCards) != 1 || f.s.UnresolvedUseCards[0].InstanceID != id || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("spent physical metadata")
	}
	cloned := CloneState(f.s)
	cloned.UnresolvedUseCards[0].UseMarkers[0].Uses = 99
	if f.s.UnresolvedUseCards[0].UseMarkers[0].Uses != 1 {
		t.Fatal("clone aliases metadata")
	}
	at := slices.Index(f.s.Discard, "ak-12km")
	f.s.Discard = append(f.s.Discard[:at], f.s.Discard[at+1:]...)
	f.s.Players[0].Hand = append(f.s.Players[0].Hand, "ak-12km")
	before := Snapshot(f.s)
	r := ApplyWithEvents(f.s, f.gd, Action{Type: ActAttachPawn, TargetID: f.actor, CardID: "ak-12km"})
	if r.Accepted || !strings.Contains(r.Error, "lifetime") || Snapshot(f.s) != before {
		t.Fatal("unresolved reuse bypass", r)
	}
}
func TestBlackClinicLargeSpecialDefenseArrowAndOctagonException(t *testing.T) {
	f := clinicFixture(t, false)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, f.actor))
	p := f.s.Cybernet.PawnByID(f.actor)
	defense, err := DefenseProfile(f.s, f.gd, p)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range defense {
		if d.Shielded {
			t.Fatal("white defense did not remove shield")
		}
	}
	f.s.Cybernet.PawnByID(f.target).Coord = domain.Coord{Q: 1}
	f.s.Cybernet.PawnByID(f.target).SpaceID = "clinic"
	if CanEndOn(f.gd, f.s.Cybernet, p.Coord, "clinic", f.actor) != nil {
		t.Fatal("large circle capacity")
	}
	f.s.Cybernet.PawnByID(f.target).SpaceID = "hand"
	if CanEndOn(f.gd, f.s.Cybernet, p.Coord, "hand", f.actor) == nil {
		t.Fatal("normal hand capacity")
	}
	has := func(from, to string) bool {
		return slices.ContainsFunc(StepTargets(f.gd, f.s.Cybernet, p.Coord, from, f.actor), func(r SpaceRef) bool { return r.SpaceID == to })
	}
	if !has("helmet", "hand") || has("hand", "helmet") {
		t.Fatal("internal arrow")
	}
	f.take(t, 0, "octagon-dex")
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: f.actor, CardID: "octagon-dex"})
	if !has("hand", "helmet") {
		t.Fatal("Octagon exception")
	}
}
func TestBlackClinicHandSpaceRecyclingAndLeaving(t *testing.T) {
	f := clinicFixture(t, false)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, f.actor))
	before := clinicProfile(t, f, "p1")
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}}})
	expected := HandSizeProfile{Base: 5, Spaces: -1, Maximum: 4}
	if clinicProfile(t, f, "p1") != expected {
		t.Fatal("stopped space maximum")
	}
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil || view.Players[0].HandSize == nil || *view.Players[0].HandSize != expected {
		t.Fatal("public maximum", err)
	}
	if !AdvancePhase(f.s, f.gd).Accepted {
		t.Fatal("end action")
	}
	antroAccept(t, f, Action{Type: ActRecycle})
	if len(f.s.Players[0].Hand) != 4 {
		t.Fatal("space refill")
	}
	f.s.Cybernet.PawnByID(f.actor).SpaceID = "clinic"
	if clinicProfile(t, f, "p1") != before {
		t.Fatal("persistent stop stacking")
	}
}
func TestBlackClinicCombinedHandModifiersControllerChangesPurityAndFrozenCompatibility(t *testing.T) {
	f := clinicFixture(t, false)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, f.actor))
	f.take(t, 0, "selective-disclosure")
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: f.actor, CardID: "selective-disclosure"})
	f.s.Cybernet.PawnByID(f.actor).SpaceID = "hand"
	if clinicProfile(t, f, "p1") != (HandSizeProfile{Base: 5, Attachments: 1, Spaces: -1, Maximum: 5}) {
		t.Fatal("combined attachment/space")
	}
	raw, _ := json.Marshal(f.gd.Blocks)
	var blocks []domain.Block
	_ = json.Unmarshal(raw, &blocks)
	var b domain.Block
	for _, v := range blocks {
		if v.ID == "black-clinic" {
			b = v
		}
	}
	b.ID = "fixture-hand-space"
	b.Provisional = true
	f.gd.Blocks = append(f.gd.Blocks, b)
	f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: b.ID, Coord: domain.Coord{Q: 3}})
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
	f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", Coord: domain.Coord{Q: 3}, SpaceID: "hand"})
	if err := GainPawnControl(f.s, f.gd, "gynoid", "p1"); err != nil {
		t.Fatal(err)
	}
	if clinicProfile(t, f, "p1").Maximum != 4 {
		t.Fatal("multiple stopped pawns")
	}
	if err := GainPawnControl(f.s, f.gd, "gynoid", "p2"); err != nil {
		t.Fatal(err)
	}
	if clinicProfile(t, f, "p1").Maximum != 5 || clinicProfile(t, f, "p2").Maximum != 4 {
		t.Fatal("current controller")
	}
	before := Snapshot(f.s)
	rng := *f.s.RNG
	_ = clinicProfile(t, f, "p1")
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("profile preview mutation")
	}
	f.s.Players[0].MaxHandSize = 0
	f.s.Cybernet.PawnByID(f.actor).Attachments = nil
	if clinicProfile(t, f, "p1").Maximum != 0 {
		t.Fatal("physical nonnegative maximum")
	}
	gd, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	for i := range gd.Blocks {
		if gd.Blocks[i].IsCentralCore {
			gd.Blocks[i].Spaces[0].Modifier = &domain.SpaceModifier{Kind: "hand-size", Amount: -2}
		}
	}
	profile, err := HandSizeProfileFor(s, gd, "p1")
	if err != nil || profile.Spaces != 0 {
		t.Fatal("frozen source separation", err)
	}
}
func TestBlackClinicRepeatTakeoverStaleSourceAndImmediateVictory(t *testing.T) {
	f := clinicFixture(t, true)
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, f.target))
	serial := f.s.DecisionSerial
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.Players[1].ControlMarkersPlaced = 1
	f.s.RNG = domain.NewRNG(5)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "move-1", Coord: &domain.Coord{Q: 1}})
	if f.s.DecisionSerial != serial+1 || f.s.Players[1].ControlMarkersPlaced != 0 {
		t.Fatal("repeated control")
	}
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	restrictionReject(t, f.s, f.gd, clinicResponse(f, f.actor))
	win := clinicFixture(t, true)
	clinicPrepare(t, win)
	win.s.Players[0].ControlMarkersTotal = 1
	clinicCapture(t, win)
	if win.s.WinnerID != "p1" || win.s.PendingChoice != nil || len(win.s.Cybernet.PawnByID(win.actor).Attachments) != 3 {
		t.Fatal("immediate victory cleanup")
	}
}
func TestBlackClinicTrojanRevealRemovedWithoutChangingControlOrCards(t *testing.T) {
	f := clinicFixture(t, false)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "gynoid" })
	f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "gynoid", SpaceID: "core"})
	if err := GainPawnControl(f.s, f.gd, "gynoid", "p2"); err != nil {
		t.Fatal(err)
	}
	f.take(t, 0, "trojan")
	antroAccept(t, f, Action{Type: ActAttachEnemy, PawnID: f.actor, TargetID: "gynoid", CardID: "trojan"})
	cards := sprawlInventory(f.s)
	if !ControllerHandRevealed(f.s, f.gd, "p2") {
		t.Fatal("Trojan reveal")
	}
	clinicPrepare(t, f)
	clinicCapture(t, f)
	antroAccept(t, f, clinicResponse(f, "gynoid"))
	view, err := PlayerView(f.s, f.gd, "")
	if err != nil || ControllerHandRevealed(f.s, f.gd, "p2") || view.Players[1].Hand.Visibility != "hidden" || f.s.Cybernet.PawnByID("gynoid").OwnerID != "p2" || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("reveal/control cleanup", err)
	}
}
func TestBlackClinicMalformedDescriptorsHandSpacesAndIsolatedStrictAcceptance(t *testing.T) {
	for _, mutation := range []string{"scope", "optional", "amount", "target", "timing", "hand-amount", "hand-dice"} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("black-clinic")
		e := b.Effects.UnderControl
		switch mutation {
		case "scope":
			e.Scope = "adjacent-blocks"
		case "optional":
			e.Optional = true
		case "amount":
			e.Amount = 1
		case "target":
			e.Target = "gynoid"
		case "timing":
			b.Effects = domain.BlockEffects{InCybernet: e}
		case "hand-amount":
			b.Spaces[2].Modifier.Amount = 0
		case "hand-dice":
			b.Spaces[2].Modifier.Dice = []domain.DefenseDie{{Value: 1, Shielded: true}}
		}
		if _, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
			t.Fatal("unsupported descriptor", mutation)
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "black-clinic" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	gd.Cards = []domain.ActionCard{}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || len(s.Cybernet.Blocks) != 1 {
		t.Fatal("isolated strict acceptance", err)
	}
}
