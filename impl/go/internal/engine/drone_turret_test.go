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

func turretFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-2", "worm", "move-1", "move-1", "servocanon"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "dummy"} {
		f.take(t, 1, id)
	}
	copyleftGrant(t, s, "p1", 1)
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "military-development" })
	s.BlockPile = append(s.BlockPile, "military-development")
	return f
}
func turretPrepare(t *testing.T, f malwareFixture) [][]EngineEvent {
	t.Helper()
	out := [][]EngineEvent{}
	out = append(out, antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"}).Events)
	if !slices.Contains(f.s.Reserve, "drone-turret") {
		t.Fatal("reserve")
	}
	out = append(out, antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:5"}).Events)
	if f.s.Cybernet.PawnByID("drone-turret") != nil {
		t.Fatal("premature deployment")
	}
	out = append(out, antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-turret"}}}).Events)
	f.s.RNG = domain.NewRNG(5)
	out = append(out, antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}}).Events)
	return out
}
func turretApproach(t *testing.T, f malwareFixture) TransitionResult {
	engineeringTurn(t, f)
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-turret"}}})
}
func turretRoll(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
}
func turretAssign(t *testing.T, f malwareFixture, ids ...string) {
	antroAccept(t, f, Action{Type: ActAssignDelete, PlayerID: "p1", TargetIDs: ids})
}

func TestMilitaryDevelopmentTurretBilingualSourceOffTurnAndSharedByteEvidence(t *testing.T) {
	f := turretFixture(t)
	b, _ := f.gd.BlockByID("military-development")
	p, _ := f.gd.PawnByID("drone-turret")
	if !reflect.DeepEqual(b.Edges, []bool{false, true, false, false, true, false}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{}, {"right"}, {}, {}, {"hand"}, {}}) || !slices.Equal(b.IceFaces, []int{4, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, true, true, true, false, true}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h2", "h3", "h5", "h6"}) || len(b.Spaces) != 3 || b.Spaces[1].Capacity != domain.UnlimitedCapacity || b.Spaces[0].Modifier.Kind != "hand-size" || b.Spaces[0].Modifier.Amount != 1 || !slices.Equal(p.Class, []string{"drone"}) || !slices.Equal(p.IceFaces, []int{1, 4}) || p.Movement.Activation != "none" || p.AbilityTurn != "any-player-turn" || !slices.Equal(p.Slots, []string{"module"}) || len(p.Abilities) != 1 || p.Abilities[0].Ability != "delete" || p.Abilities[0].Activation != "card" || p.Abilities[0].Skulls != 1 {
		t.Fatal("printed source facts")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 4) {
			t.Fatal("defense")
		}
	}
	initial := Snapshot(f.s)
	events := turretPrepare(t, f)
	controlled := Snapshot(f.s)
	entered := turretApproach(t, f)
	before := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd, "p1")
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	rolled := turretRoll(t, f)
	pending := Snapshot(f.s)
	assignOptions := AvailableActions(f.s, f.gd, "p1")
	assigned := antroAccept(t, f, Action{Type: ActAssignDelete, PlayerID: "p1", TargetIDs: []string{f.target}})
	events = append(events, entered.Events, rolled.Events, assigned.Events)
	spectator, err := EventsForPlayer(f.s, rolled.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]any{"initial": initial, "controlled": controlled, "before": before, "options": options, "view": view, "pending": pending, "assignmentOptions": assignOptions, "finished": Snapshot(f.s), "events": events, "spectator": spectator}
	encoded, _ := json.Marshal(got)
	var a, both any
	json.Unmarshal(encoded, &a)
	json.Unmarshal([]byte(readGolden(t, "drone-turret.json")), &both)
	if !reflect.DeepEqual(a, both) {
		t.Fatal("shared Turret evidence differs")
	}
}
func TestTurretOffTurnControllerPaysAndAssignsWithoutChangingActiveTurn(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	cards := sprawlInventory(f.s)
	other := slices.Clone(f.s.Players[1].Hand)
	r := turretRoll(t, f)
	found := false
	for _, e := range r.Events {
		if e.Type == EventRoll && slices.Equal(e.Roll, []int{3}) {
			found = true
		}
	}
	if !found || f.s.PendingAttack.PlayerID != "p1" || f.s.CurrentPlayer != 1 || f.s.Phase != domain.PhaseAction || !slices.Equal(other, f.s.Players[1].Hand) || !slices.Equal(f.s.PlayedCardOwners, []string{"p2", "p1"}) {
		t.Fatal("controller/window")
	}
	for _, a := range []Action{{Type: ActAssignDelete, PlayerID: "p2", TargetIDs: []string{f.target}}, {Type: ActAssignDelete, TargetIDs: []string{f.target}}, {Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"}, {Type: ActAssignDelete, PlayerID: "p1", TargetIDs: []string{"missing"}}} {
		restrictionReject(t, f.s, f.gd, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted || len(AvailableActions(f.s, f.gd, "p2")) != 0 {
		t.Fatal("active player stole window")
	}
	turretAssign(t, f, f.target)
	if !slices.Contains(f.s.Eliminated, f.target) || f.s.CurrentPlayer != 1 || f.s.Phase != domain.PhaseAction || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("assignment/accounting")
	}
}
func TestTurretPureOffTurnOptionsAndHiddenHands(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	o := AvailableActions(f.s, f.gd, "p1")
	if len(o) == 0 {
		t.Fatal("no options")
	}
	for _, v := range o {
		if v.Action.PlayerID != "p1" || v.Action.PawnID != "drone-turret" || v.Action.Type != ActRollDelete && v.Action.Type != ActPlayDelete {
			t.Fatal("unpermitted option")
		}
	}
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := PlayerView(f.s, f.gd, "")
	if !reflect.DeepEqual(view.Options, o) || len(view.Players[1].Hand.Cards) != 0 || len(spec.Options) != 0 || Snapshot(f.s) != before || rng.Intn(100000) != f.s.RNG.Intn(100000) {
		t.Fatal("purity/privacy")
	}
	o[0].Action.PawnID = "changed"
	if AvailableActions(f.s, f.gd, "p1")[0].Action.PawnID != "drone-turret" {
		t.Fatal("alias")
	}
}
func TestTurretPermissionGrantsNoOtherPawnMovementFreeAbilityAttachmentOrTurnControl(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	for _, a := range []Action{{Type: ActPass}, {Type: ActRecycle}, {Type: ActPlaceMarker}, {Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"}, {Type: ActRollDelete, PawnID: f.actor, CardID: "move-1"}, {Type: ActRollDelete, PawnID: "drone-turret"}, {Type: ActSearch, PawnID: "drone-turret"}, {Type: ActPlaySearch, PawnID: "drone-turret", CardID: "move-1"}, {Type: ActPlayIcebreakBlk, PawnID: "drone-turret", CardID: "move-1", Coord: &domain.Coord{Q: 1}}, {Type: ActAttachPawn, TargetID: "drone-turret", CardID: "servocanon"}, {Type: ActPlayMove, PawnID: "drone-turret", CardID: "move-1"}, {Type: ActRollDelete, PawnID: "drone-turret", CardID: "worm"}, {Type: ActRollDelete, PawnID: "drone-turret", CardID: "move-1", Joint: true}} {
		a.PlayerID = "p1"
		restrictionReject(t, f.s, f.gd, a)
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PlayerID: "p2", PawnID: "drone-turret", CardID: "move-1"})
}
func TestTurretPermittedAbilitiesBetweenActionsInEveryPhaseRetainFaceUpPayment(t *testing.T) {
	for _, phase := range []domain.Phase{domain.PhaseBeginning, domain.PhaseAction, domain.PhaseRecycle, domain.PhaseEnd} {
		f := turretFixture(t)
		turretPrepare(t, f)
		turretApproach(t, f)
		f.s.Phase = phase
		n := len(f.s.Players[0].Hand)
		turretRoll(t, f)
		if len(f.s.Players[0].Hand) != n-1 || !slices.Contains(f.s.PlayedCards, "move-1") || f.s.PlayedCardOwners[len(f.s.PlayedCardOwners)-1] != "p1" {
			t.Fatal("phase payment")
		}
		turretAssign(t, f, "")
		if f.s.Phase != phase || f.s.CurrentPlayer != 1 {
			t.Fatal("phase changed")
		}
		found := false
		for _, o := range AvailableActions(f.s, f.gd, "p1") {
			found = found || o.Action.Type == ActRollDelete
		}
		if !found {
			t.Fatal("permission missing")
		}
		if phase == domain.PhaseRecycle && AvailableActions(f.s, f.gd, "p2")[0].Action.Type != ActRecycle {
			t.Fatal("recycle hidden")
		}
	}
}
func TestTurretEachControllerRecyclesTheirOwnDuplicatePhysicalCards(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	for i := 0; i < 2; i++ {
		turretRoll(t, f)
		turretAssign(t, f, "")
	}
	if !slices.Equal(f.s.PlayedCards, []string{"move-2", "move-1", "move-1"}) {
		t.Fatal("physical duplicates")
	}
	cards := sprawlInventory(f.s)
	if !AdvancePhase(f.s, f.gd).Accepted {
		t.Fatal("phase")
	}
	antroAccept(t, f, Action{Type: ActRecycle})
	if !slices.Equal(f.s.PlayedCards, []string{"move-1", "move-1"}) || !slices.Equal(f.s.PlayedCardOwners, []string{"p1", "p1"}) || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("wrong controller recycle")
	}
	for i := 0; i < 2; i++ {
		if !AdvancePhase(f.s, f.gd).Accepted {
			t.Fatal("turn")
		}
	}
	if f.s.CurrentPlayer != 0 || len(f.s.PlayedCards) != 2 {
		t.Fatal("turn cleared payment")
	}
	if !AdvancePhase(f.s, f.gd).Accepted {
		t.Fatal("phase")
	}
	antroAccept(t, f, Action{Type: ActRecycle})
	if len(f.s.PlayedCards) != 0 || f.s.PlayedCardOwners != nil || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("own recycle")
	}
}
func TestTurretCannotInterruptSearchOrRolledMovement(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.target, CardID: "move-1"})
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
	if len(AvailableActions(f.s, f.gd, "p1")) != 0 || f.s.PendingChoice.Kind != "place-block" {
		t.Fatal("Search interrupted")
	}
	g := turretFixture(t)
	turretPrepare(t, g)
	turretApproach(t, g)
	p, _ := g.gd.PawnByID(g.target)
	p.Movement = domain.Movement{Type: "d6", Activation: "once-per-turn"}
	antroAccept(t, g, Action{Type: ActRollMovement, PawnID: g.target})
	restrictionReject(t, g.s, g.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
	if g.s.PendingChoice.Kind != "move-path" {
		t.Fatal("movement interrupted")
	}
}
func TestTurretOffTurnDeletePreservesDefenderDummyAuthority(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	copyleftGrant(t, f.s, "p2", 1)
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.target})
	turretRoll(t, f)
	turretAssign(t, f, f.target)
	c := f.s.PendingChoice
	if c == nil || c.Kind != "prevent-elimination" || c.PlayerID != "p2" {
		t.Fatal("defender window")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, PlayerID: "p1", ChoiceID: c.ID, OptionID: "prevent"})
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
	found := false
	for _, a := range AvailableActions(f.s, f.gd, "p2")[0].Responses {
		if a.OptionID == "prevent" {
			antroAccept(t, f, a)
			found = true
			break
		}
	}
	if !found || f.s.Cybernet.PawnByID(f.target) == nil || f.s.CurrentPlayer != 1 || f.s.Phase != domain.PhaseAction || f.s.PendingAttack != nil {
		t.Fatal("prevention")
	}
}
func TestTurretModuleFreeDeleteSeparateFromPaidAndCurrentControllerReset(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-turret", CardID: "servocanon"})
	turretApproach(t, f)
	antroAccept(t, f, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret"})
	turretAssign(t, f, "", "")
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret"})
	turretRoll(t, f)
	turretAssign(t, f, "", "")
	n := 0
	for _, m := range UseMarkerAllocations(f.s) {
		if m.PawnID == "drone-turret" && m.Ability == "delete" {
			n++
		}
	}
	if n != 1 {
		t.Fatal("free marker")
	}
	engineeringTurn(t, f)
	for _, m := range UseMarkerAllocations(f.s) {
		if m.PawnID == "drone-turret" {
			t.Fatal("not cleared at own beginning")
		}
	}
	if f.s.Players[0].BonusCounters != 0 {
		t.Fatal("cost")
	}
}
func TestMilitaryHandSpaceCurrentControllerAndNoTurretMovement(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	p, _ := f.gd.PawnByID("drone-turret")
	if len(EffectiveMovementOptions(f.gd, p, nil)) != 0 {
		t.Fatal("movement")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: p.ID, CardID: "move-1"})
	profile, _ := HandSizeProfileFor(f.s, f.gd, "p1")
	if profile.Spaces != 0 {
		t.Fatal("home hand limit")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}}})
	profile, _ = HandSizeProfileFor(f.s, f.gd, "p1")
	other, _ := HandSizeProfileFor(f.s, f.gd, "p2")
	if profile.Spaces != 1 || other.Spaces != 0 {
		t.Fatal("current stopped pawn")
	}
	f.s.Cybernet.PawnByID(f.actor).SpaceID = "drone-turret"
	f.s.Cybernet.PawnByID(p.ID).SpaceID = "hand"
	profile, _ = HandSizeProfileFor(f.s, f.gd, "p1")
	if profile.Spaces != 1 {
		t.Fatal("explicit relocation benefit")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: p.ID, Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "drone-turret"}}})
}
func TestTurretPermissionFollowsControlAndEliminationWithDetachedOwners(t *testing.T) {
	f := turretFixture(t)
	turretPrepare(t, f)
	turretApproach(t, f)
	if err := GainPawnControl(f.s, f.gd, "drone-turret", "p2"); err != nil {
		t.Fatal(err)
	}
	if len(AvailableActions(f.s, f.gd, "p1")) != 0 {
		t.Fatal("old controller")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
	antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-turret", CardID: "move-1"})
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{""}})
	copy := CloneState(f.s)
	copy.PlayedCardOwners[0] = "changed"
	v, _ := PlayerView(f.s, f.gd, "p2")
	v.PlayedCardOwners[0] = "changed"
	if f.s.PlayedCardOwners[0] != "p2" {
		t.Fatal("alias")
	}
	cards := sprawlInventory(f.s)
	if !eliminatePawn(f.s, "drone-turret", f.gd) || !slices.Contains(f.s.Reserve, "drone-turret") || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("elimination")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-turret" && (c.Zone != "common" || c.OwnerID != "") {
			t.Fatal("common card")
		}
	}
}
func TestTurretUnsupportedPermissionsFinishedAndCorruptOwnershipRejectAtomically(t *testing.T) {
	f := turretFixture(t)
	p, _ := f.gd.PawnByID("drone-turret")
	p.AbilityTurn = "all-actions"
	if _, err := NewGame(Config{Data: f.gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
		t.Fatal("unsupported permission")
	}
	g := turretFixture(t)
	turretPrepare(t, g)
	turretApproach(t, g)
	g.s.WinnerID = "p2"
	restrictionReject(t, g.s, g.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
	if len(AvailableActions(g.s, g.gd, "p1")) != 0 {
		t.Fatal("finished options")
	}
	h := turretFixture(t)
	turretPrepare(t, h)
	turretApproach(t, h)
	h.s.PlayedCardOwners = []string{}
	restrictionReject(t, h.s, h.gd, Action{Type: ActRollDelete, PlayerID: "p1", PawnID: "drone-turret", CardID: "move-1"})
}

func TestMilitaryMalformedDeploymentRollsBackAndVictoryStopsBeforeTurretPlacement(t *testing.T) {
	f := turretFixture(t)
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	options := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			options = append(options, a.OptionID)
		}
	}
	if !slices.Equal(options, []string{"place:0:2", "place:0:5"}) {
		t.Fatal("entrance rotations")
	}
	antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:5"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-turret"}}})
	f.s.ControlCards = slices.DeleteFunc(f.s.ControlCards, func(c domain.ControlCardState) bool { return c.Subject.ID == "drone-turret" })
	f.s.RNG = domain.NewRNG(5)
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	g := turretFixture(t)
	g.s.Players[0].ControlMarkersTotal = 1
	turretPrepare(t, g)
	if g.s.WinnerID != "p1" || g.s.Cybernet.PawnByID("drone-turret") != nil || !slices.Contains(g.s.Reserve, "drone-turret") {
		t.Fatal("victory deployment")
	}
	for _, c := range g.s.ControlCards {
		if c.Subject.ID == "drone-turret" && (c.Zone != "common" || c.OwnerID != "") {
			t.Fatal("common card")
		}
	}
}
