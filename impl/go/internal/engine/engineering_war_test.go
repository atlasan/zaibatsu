package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func engineeringFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-2", "worm", "move-1", "move-1", "move-3", "servocanon"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "move-1", "move-1", "move-3"} {
		f.take(t, 1, id)
	}
	copyleftGrant(t, s, "p1", 1)
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "engineering-war" })
	s.BlockPile = append(s.BlockPile, "engineering-war")
	return f
}
func engineeringPlace(t *testing.T, f malwareFixture) []TransitionResult {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:5"})
	return []TransitionResult{a, b}
}
func engineeringPrepare(t *testing.T, f malwareFixture) []TransitionResult {
	p := engineeringPlace(t, f)
	p = append(p, antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "defense"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-mk-2"}}}))
	return p
}
func engineeringCapture(t *testing.T, f malwareFixture, pawnID, cardID string) TransitionResult {
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawnID, CardID: cardID, Coord: &domain.Coord{Q: 1}})
}
func engineeringFreeToCore(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActMoveSteps, PawnID: "drone-mk-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "defense"}, {SpaceID: "core"}}})
}
func engineeringTurn(t *testing.T, f malwareFixture) {
	t.Helper()
	if r := AdvancePhase(f.s, f.gd); !r.Accepted {
		t.Fatal(r)
	}
	antroAccept(t, f, Action{Type: ActRecycle})
	for i := 0; i < 2; i++ {
		if r := AdvancePhase(f.s, f.gd); !r.Accepted {
			t.Fatal(r)
		}
	}
}
func engineeringMarker(s *domain.GameState) *UseMarkerAllocation {
	for _, m := range UseMarkerAllocations(s) {
		if m.PawnID == "drone-mk-2" && m.Ability == "move" {
			return &m
		}
	}
	return nil
}
func TestEngineeringWarMK2BilingualSourceMovementCombatAndSharedByteEvidence(t *testing.T) {
	f := engineeringFixture(t)
	b, _ := f.gd.BlockByID("engineering-war")
	p, _ := f.gd.PawnByID("drone-mk-2")
	if !slices.Equal(b.IceFaces, []int{3, 6}) || !reflect.DeepEqual(b.Edges, []bool{false, true, false, false, true, false}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{}, {"right"}, {}, {}, {"defense"}, {}}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, true, true, true, true, false}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h2", "h3", "h5", "h6"}) || len(b.SpaceArrows) != 0 || b.Spaces[0].Capacity != 1 || b.Spaces[1].Capacity != domain.UnlimitedCapacity || b.Spaces[2].Capacity != 1 || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "drone-mk-2" || !slices.Equal(p.Class, []string{"drone"}) || !slices.Equal(p.IceFaces, []int{2, 6}) || p.Movement.Type != "steps" || p.Movement.Steps != 5 || p.Movement.Activation != "once-per-turn" || !slices.Equal(p.Slots, []string{"module"}) || len(p.Abilities) != 1 || p.Abilities[0].Ability != "delete" || p.Abilities[0].Activation != "card" || p.Abilities[0].Skulls != 1 {
		t.Fatal("printed exact records")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 3) {
			t.Fatal("printed defense")
		}
	}
	initial := Snapshot(f.s)
	prepared := engineeringPrepare(t, f)
	captured := engineeringCapture(t, f, f.actor, "worm")
	controlled := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	move := engineeringFreeToCore(t, f)
	spent := Snapshot(f.s)
	rolled := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-mk-2", CardID: "move-1"})
	pending := Snapshot(f.s)
	assignmentOptions := AvailableActions(f.s, f.gd)
	assigned := antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
	spectator, err := EventsForPlayer(f.s, rolled.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": controlled, "options": options, "view": view, "spent": spent, "pending": pending, "assignmentOptions": assignmentOptions, "finished": Snapshot(f.s), "events": [][]EngineEvent{prepared[0].Events, prepared[1].Events, prepared[2].Events, captured.Events, move.Events, rolled.Events, assigned.Events}, "spectator": spectator}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "engineering-war.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Engineering War shared evidence mismatch", string(raw))
	}
}
func TestEngineeringWarTwoEntrancesSearchResponsesArePureAndPreservePaidReveal(t *testing.T) {
	f := engineeringFixture(t)
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	before := Snapshot(f.s)
	rng := *f.s.RNG
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if a.OptionID == "place:0:2" || a.OptionID == "place:0:5" {
			ids = append(ids, a.OptionID)
		}
		if a.OptionID == "place:0:0" {
			t.Fatal("closed connection exposed")
		}
	}
	if !slices.Equal(ids, []string{"place:0:2", "place:0:5"}) {
		t.Fatal("two entrances", ids)
	}
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("preview state/RNG")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	if !slices.Contains(f.s.Discard, "dj") || f.s.PendingChoice.BlockID != "engineering-war" {
		t.Fatal("rejected placement undid reveal/payment")
	}
}
func TestEngineeringWarCaptureDeploysOnePhysicalPawnAndMatchingControlCard(t *testing.T) {
	f := engineeringFixture(t)
	cards := sprawlInventory(f.s)
	engineeringPlace(t, f)
	if !slices.Contains(f.s.Reserve, "drone-mk-2") || f.s.Cybernet.PawnByID("drone-mk-2") != nil {
		t.Fatal("placement deployed pawn")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-mk-2" && (c.Zone != "common" || c.OwnerID != "") {
			t.Fatal("early control card")
		}
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "defense"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-mk-2"}}})
	r := engineeringCapture(t, f, f.actor, "worm")
	p := f.s.Cybernet.PawnByID("drone-mk-2")
	if p == nil || p.OwnerID != "p1" || p.Coord != (domain.Coord{Q: 1}) || p.SpaceID != "drone-mk-2" || slices.Contains(f.s.Reserve, "drone-mk-2") || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("physical controlled placement")
	}
	count := 0
	for _, p := range f.s.Cybernet.Pawns {
		if p.PawnID == "drone-mk-2" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("duplicate piece")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-mk-2" && (c.OwnerID != "p1" || c.Zone != "control") {
			t.Fatal("physical control card")
		}
	}
	controlled, placed := -1, -1
	for i, e := range r.Events {
		if e.Type == EventControlChanged && e.Element == "block" && controlled < 0 {
			controlled = i
		}
		if e.Type == EventPawnPlaced {
			placed = i
		}
	}
	if controlled < 0 || controlled >= placed {
		t.Fatal("source operation order", r.Events)
	}
}
func TestMK2FiveFreeStepsOccupiedPassThroughAndIndependentPaidMovement(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	at := func(id string) SpaceRef { return SpaceRef{Coord: domain.Coord{Q: 1}, SpaceID: id} }
	path := []SpaceRef{at("defense"), at("drone-mk-2"), at("right"), at("drone-mk-2"), at("defense")}
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-mk-2", Path: append(slices.Clone(path), at("drone-mk-2"))})
	rng := *f.s.RNG
	r := antroAccept(t, f, Action{Type: ActMoveSteps, PawnID: "drone-mk-2", Path: path})
	after := *f.s.RNG
	m := engineeringMarker(f.s)
	if rng.Intn(100000) != after.Intn(100000) || slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == EventRoll }) || m == nil || m.Uses != 1 || m.OwnerID != "p1" {
		t.Fatal("native fixed movement")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-mk-2"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-mk-2", CardID: "move-1", Path: []SpaceRef{at("drone-mk-2")}})
	if engineeringMarker(f.s).Uses != 1 || !slices.ContainsFunc(AvailableActions(f.s, f.gd), func(o AvailableAction) bool { return o.Action.PawnID == "drone-mk-2" && o.Action.Type == ActPlayMove }) {
		t.Fatal("paid fallback spent/refreshed free movement")
	}
}
func TestMK2CardDeleteOneSkullCommitsPublicRollBeforeAssignmentAndRejectsWithoutReroll(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	engineeringFreeToCore(t, f)
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "drone-mk-2"})
	r := antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-mk-2", CardID: "move-1"})
	roll := []int{}
	for _, e := range r.Events {
		if e.Type == EventRoll {
			roll = e.Roll
		}
	}
	o := AvailableActions(f.s, f.gd)
	if !slices.Equal(roll, []int{3}) || !slices.Contains(f.s.PlayedCards, "move-1") || len(o) != 1 || o[0].Action.Type != ActAssignDelete {
		t.Fatal("one-skull public assignment window")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActAssignDelete, TargetIDs: []string{f.actor}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: "drone-mk-2", CardID: "move-1"})
	rng := *f.s.RNG
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
	after := *f.s.RNG
	if !slices.Contains(f.s.Eliminated, f.target) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("assignment rerolled or lost hit")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == f.target && c.OwnerID != "p2" {
			t.Fatal("retained Reboot ownership")
		}
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
}
func TestMK2ModuleCostSingleFreeActivatorAndNativePaidDeleteCoexist(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	slots := PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID("drone-mk-2"))
	if len(slots) != 1 || slots[0].Ref != "pawn:module" {
		t.Fatal("printed Module slot")
	}
	f.take(t, 0, "octagon-dex")
	restrictionReject(t, f.s, f.gd, Action{Type: ActAttachPawn, TargetID: "drone-mk-2", CardID: "octagon-dex"})
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-mk-2", CardID: "servocanon", SlotRef: "pawn:module"})
	p, _ := f.gd.PawnByID("drone-mk-2")
	profile := PawnDeleteProfile(f.gd, p, f.s.Cybernet.PawnByID("drone-mk-2").Attachments)
	if f.s.Players[0].BonusCounters != 0 || profile.Skulls != 2 || !profile.Card || profile.FreeActivators != 1 {
		t.Fatal("printed module/native combination")
	}
	engineeringFreeToCore(t, f)
	antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-mk-2"})
	if len(f.s.PendingAttack.Roll) != 2 {
		t.Fatal("module strength")
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{"", ""}})
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "drone-mk-2"})
	antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-mk-2", CardID: "move-1"})
	if len(f.s.PendingAttack.Roll) != 2 {
		t.Fatal("paid strength")
	}
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{"", ""}})
	count := 0
	for _, m := range UseMarkerAllocations(f.s) {
		if m.PawnID == "drone-mk-2" && m.Ability == "delete" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("physical limited activation")
	}
}
func TestMK2TakeoverRelocatesRefundsAndPreservesNativeUseUntilNewControllerBeginning(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-mk-2", CardID: "servocanon"})
	engineeringFreeToCore(t, f)
	engineeringTurn(t, f)
	if f.s.CurrentPlayer != 1 {
		t.Fatal("next controller turn")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "defense"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-mk-2"}}})
	engineeringCapture(t, f, f.target, "move-1")
	p := f.s.Cybernet.PawnByID("drone-mk-2")
	m := engineeringMarker(f.s)
	if p.OwnerID != "p2" || p.Coord != (domain.Coord{Q: 1}) || p.SpaceID != "drone-mk-2" || len(p.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 || f.s.Players[0].ControlMarkersPlaced != 0 || f.s.Players[1].ControlMarkersPlaced != 1 || m == nil || m.OwnerID != "p2" || m.Uses != 1 {
		t.Fatal("takeover physical state")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-mk-2"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-mk-2", CardID: "move-1"})
	engineeringTurn(t, f)
	if engineeringMarker(f.s) == nil {
		t.Fatal("old controller cleared marker")
	}
	engineeringTurn(t, f)
	if engineeringMarker(f.s) != nil {
		t.Fatal("new controller beginning did not clear")
	}
	antroAccept(t, f, Action{Type: ActMoveSteps, PawnID: "drone-mk-2"})
}
func TestEngineeringWarSameControllerRepeatPlacementPreservesModuleAndSpentMovement(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-mk-2", CardID: "servocanon"})
	engineeringFreeToCore(t, f)
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.Players[1].ControlMarkersPlaced = 1
	engineeringCapture(t, f, f.actor, "move-1")
	p := f.s.Cybernet.PawnByID("drone-mk-2")
	if len(p.Attachments) != 1 || f.s.Players[0].BonusCounters != 0 || p.SpaceID != "drone-mk-2" || engineeringMarker(f.s).Uses != 1 {
		t.Fatal("same-controller placement reset/discarded physical sources")
	}
}
func TestMK2EliminationReturnsNonRebootPawnCardRefundsAndRetainsPhysicalNativeMarker(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-mk-2", CardID: "servocanon"})
	engineeringFreeToCore(t, f)
	cards := sprawlInventory(f.s)
	if !eliminatePawn(f.s, "drone-mk-2", f.gd) {
		t.Fatal("elimination")
	}
	if !slices.Contains(f.s.Reserve, "drone-mk-2") || slices.Contains(f.s.Eliminated, "drone-mk-2") || f.s.Players[0].BonusCounters != 1 || !slices.Equal(cards, sprawlInventory(f.s)) || engineeringMarker(f.s).OwnerID != "" {
		t.Fatal("released physical piece/card/marker")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-mk-2" && (c.OwnerID != "" || c.Zone != "common") {
			t.Fatal("release card zone")
		}
	}
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.Players[1].ControlMarkersPlaced = 1
	engineeringCapture(t, f, f.actor, "move-1")
	if f.s.Cybernet.PawnByID("drone-mk-2").OwnerID != "p1" {
		t.Fatal("redeploy from reserve")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-mk-2"})
}
func TestEngineeringWarInvalidPoolsRollbackAfterRollAndImmediateVictorySkipsPlacement(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "drone-mk-2" })
	f.s.RNG = domain.NewRNG(5)
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") || f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "" {
		t.Fatal("rejected resolution payment/control")
	}
	win := engineeringFixture(t)
	engineeringPrepare(t, win)
	win.s.Players[0].ControlMarkersTotal = 1
	engineeringCapture(t, win, win.actor, "worm")
	if win.s.WinnerID != "p1" || !slices.Contains(win.s.Reserve, "drone-mk-2") || win.s.Cybernet.PawnByID("drone-mk-2") != nil {
		t.Fatal("last-marker placement suppression")
	}
}
func TestMK2DefenseICEAbsentAbilitiesAndPureDetachedOptions(t *testing.T) {
	f := engineeringFixture(t)
	engineeringPrepare(t, f)
	engineeringCapture(t, f, f.actor, "worm")
	p := f.s.Cybernet.PawnByID("drone-mk-2")
	profile, err := DefenseProfile(f.s, f.gd, p)
	if err != nil {
		t.Fatal(err)
	}
	faces := []int{}
	for _, d := range profile {
		if d.Shielded {
			faces = append(faces, d.Value)
		}
	}
	if !slices.Equal(faces, []int{1, 2, 3}) {
		t.Fatal("native shielded faces")
	}
	copy := *p
	copy.SpaceID = "defense"
	profile, err = DefenseProfile(f.s, f.gd, &copy)
	if err != nil {
		t.Fatal(err)
	}
	faces = []int{}
	for _, d := range profile {
		if d.Shielded {
			faces = append(faces, d.Value)
		}
	}
	if !slices.Equal(faces, []int{2, 3}) {
		t.Fatal("flat white1")
	}
	ids := []string{}
	for _, r := range StepTargets(f.gd, f.s.Cybernet, p.Coord, "drone-mk-2", "drone-mk-2") {
		ids = append(ids, r.SpaceID)
	}
	if !slices.Equal(ids, []string{"defense", "right"}) {
		t.Fatal("phantom title/effect spaces")
	}
	for _, a := range []Action{{Type: ActSearch, PawnID: "drone-mk-2"}, {Type: ActPlaySearch, PawnID: "drone-mk-2", CardID: "move-1"}, {Type: ActIcebreakBlk, PawnID: "drone-mk-2", Coord: &domain.Coord{Q: 1}}, {Type: ActReboot, PawnID: "drone-mk-2"}, {Type: ActMoveSteps, PawnID: "drone-mk-2", PlayerID: "p2"}} {
		restrictionReject(t, f.s, f.gd, a)
	}
	before := Snapshot(f.s)
	rng := *f.s.RNG
	_ = AvailableActions(f.s, f.gd)
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	cloned := CloneState(f.s)
	for i := range cloned.ControlCards {
		if cloned.ControlCards[i].Subject.ID == "drone-mk-2" {
			cloned.ControlCards[i].OwnerID = "p2"
		}
	}
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("detached pure options/views")
	}
}
func TestEngineeringWarMK2IsolatedStrictConstructionAndMissingMatchingCard(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "engineering-war" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "drone-mk-2" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "drone-mk-2" })
	gd.Cards = []domain.ActionCard{}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "drone-mk-2") {
		t.Fatal("isolated strict source", err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "drone-mk-2" })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
		t.Fatal("missing matching physical card accepted")
	}
}
