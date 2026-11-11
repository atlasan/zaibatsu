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

func probeFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-2", "worm", "move-1", "move-2", "servocanon"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1", "move-1"} {
		f.take(t, 1, id)
	}
	copyleftGrant(t, s, "p1", 1)
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "combat-prototypes" || id == "engineering-war" })
	s.BlockPile = append(s.BlockPile, "engineering-war", "combat-prototypes")
	return f
}
func probePlace(t *testing.T, f malwareFixture) []TransitionResult {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:5"})
	return []TransitionResult{a, b}
}
func probePrepare(t *testing.T, f malwareFixture) []TransitionResult {
	p := probePlace(t, f)
	p = append(p, antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-probe"}}}))
	f.s.RNG = domain.NewRNG(5)
	p = append(p, antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}}))
	return p
}
func probeSearch(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActSearch, PawnID: "drone-probe"})
}
func probeFinishSearch(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:5"})
}
func probeMove(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActMoveSteps, PawnID: "drone-probe", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "right"}, {Coord: domain.Coord{Q: 2}, SpaceID: "defense"}, {Coord: domain.Coord{Q: 2}, SpaceID: "drone-mk-2"}}})
}
func probeMarkers(s *domain.GameState) []UseMarkerAllocation {
	out := []UseMarkerAllocation{}
	for _, m := range UseMarkerAllocations(s) {
		if m.PawnID == "drone-probe" {
			out = append(out, m)
		}
	}
	return out
}
func TestCombatPrototypesDroneProbeBilingualSourceSearchMovementAndSharedByteEvidence(t *testing.T) {
	f := probeFixture(t)
	b, _ := f.gd.BlockByID("combat-prototypes")
	p, _ := f.gd.PawnByID("drone-probe")
	if !slices.Equal(b.IceFaces, []int{4, 6}) || !reflect.DeepEqual(b.Edges, []bool{false, true, true, false, true, true}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, false, true, true, true, true}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h3", "h6"}) || len(b.SpaceArrows) != 0 || len(b.Spaces) != 5 || b.Spaces[4].Capacity != domain.UnlimitedCapacity || b.Effects.UnderControl.Kind != "place-controlled-pawn" || b.Effects.UnderControl.Target != "drone-probe" || !slices.Equal(p.Class, []string{"drone"}) || !slices.Equal(p.IceFaces, []int{1, 3, 6}) || p.Movement.Type != "steps" || p.Movement.Steps != 5 || p.Movement.Activation != "once-per-turn" || !slices.Equal(p.Slots, []string{"module"}) || len(p.Abilities) != 1 || p.Abilities[0].Ability != "search" || p.Abilities[0].Activation != "once-per-turn" {
		t.Fatal("printed source facts")
	}
	for i, d := range p.Defense {
		if d.Value != i+1 || d.Shielded != (i < 2) {
			t.Fatal("defense")
		}
	}
	for i, sp := range b.Spaces {
		if i < 4 && sp.Capacity != 1 {
			t.Fatal("single capacity")
		}
	}
	initial := Snapshot(f.s)
	prepared := probePrepare(t, f)
	controlled := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	declared := probeSearch(t, f)
	pending := Snapshot(f.s)
	choices := AvailableActions(f.s, f.gd)
	revealed, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	placed := probeFinishSearch(t, f)
	settled := Snapshot(f.s)
	moved := probeMove(t, f)
	spectator, err := EventsForPlayer(f.s, declared.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "controlled": controlled, "options": options, "view": view, "pending": pending, "choices": choices, "revealed": revealed, "settled": settled, "finished": Snapshot(f.s), "events": [][]EngineEvent{prepared[0].Events, prepared[1].Events, prepared[2].Events, prepared[3].Events, declared.Events, placed.Events, moved.Events}, "spectator": spectator}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "drone-probe.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Drone Probe shared evidence mismatch", string(raw))
	}
}
func TestCombatPrototypesFourEntranceRotationsAndMatchingPhysicalDeployment(t *testing.T) {
	f := probeFixture(t)
	cards := sprawlInventory(f.s)
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			ids = append(ids, a.OptionID)
		}
	}
	if !slices.Equal(ids, []string{"place:0:1", "place:0:2", "place:0:4", "place:0:5"}) {
		t.Fatal("four entrance rotations", ids)
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	probeFinishSearch(t, f)
	if f.s.Cybernet.PawnByID("drone-probe") != nil || !slices.Contains(f.s.Reserve, "drone-probe") {
		t.Fatal("placement deployed pawn")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-probe"}}})
	f.s.RNG = domain.NewRNG(5)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	p := f.s.Cybernet.PawnByID("drone-probe")
	if p == nil || p.OwnerID != "p1" || p.SpaceID != "drone-probe" || p.Coord != (domain.Coord{Q: 1}) || slices.Contains(f.s.Reserve, "drone-probe") || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("physical controlled deployment")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-probe" && (c.OwnerID != "p1" || c.Zone != "control") {
			t.Fatal("card control")
		}
	}
}
func TestDroneProbeFreeSearchNeedsNoHandAndCommitsOnlySearchUseBeforePlacement(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	f.s.Deck = append(f.s.Deck, f.s.Players[0].Hand...)
	f.s.Players[0].Hand = []string{}
	before := len(f.s.BlockPile)
	rng := *f.s.RNG
	discard := slices.Clone(f.s.Discard)
	played := slices.Clone(f.s.PlayedCards)
	r := probeSearch(t, f)
	after := *f.s.RNG
	c := f.s.PendingChoice
	m := probeMarkers(f.s)
	if len(f.s.BlockPile) != before-1 || c.Kind != "place-block" || c.PawnID != "drone-probe" || c.CardID != "" || c.BlockID != "engineering-war" || *c.Reference != (domain.Coord{Q: 1}) || len(m) != 1 || m[0].Ability != "search" || m[0].Uses != 1 || m[0].OwnerID != "p1" || !slices.Equal(discard, f.s.Discard) || !slices.Equal(played, f.s.PlayedCards) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("free declaration state/cost/RNG")
	}
	if slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == "card-discarded" || e.Type == EventRoll }) {
		t.Fatal("invented cost/roll")
	}
	probeFinishSearch(t, f)
	if len(f.s.Players[0].Hand) != 0 || !slices.ContainsFunc(AvailableActions(f.s, f.gd), func(o AvailableAction) bool { return o.Action.Type == ActMoveSteps && o.Action.PawnID == "drone-probe" }) {
		t.Fatal("Search consumed movement or hand")
	}
}
func TestDroneProbePureDeclarationOptionsIgnoreHiddenTopTileTopology(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	opts := AvailableActions(f.s, f.gd)
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(opts, func(o AvailableAction) bool { return o.Action.Type == ActSearch && o.Action.PawnID == "drone-probe" }) {
		t.Fatal("free Search missing")
	}
	for _, o := range view.Options {
		if o.Action.Type == ActSearch && (len(o.Responses) > 0 || o.Action.Dir != 0 || o.Action.Rotation != 0) {
			t.Fatal("unrevealed placement exposed")
		}
	}
	clone := CloneState(f.s)
	i, last := slices.Index(clone.BlockPile, "black-clinic"), len(clone.BlockPile)-1
	clone.BlockPile[i], clone.BlockPile[last] = clone.BlockPile[last], clone.BlockPile[i]
	other, err := PlayerView(clone, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	after := *f.s.RNG
	if !reflect.DeepEqual(opts, AvailableActions(clone, f.gd)) || !reflect.DeepEqual(view, other) || len(AvailableActions(f.s, f.gd, "p2")) != 0 || Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("hidden/state/RNG preview leak")
	}
}
func TestDroneProbePendingPlacementAuthorityInterleavingAndCommittedUseRollback(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	probeSearch(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	id := f.s.PendingChoice.ID
	for _, a := range []Action{{Type: ActResolveChoice, ChoiceID: id, OptionID: "place:0:0"}, {Type: ActResolveChoice, ChoiceID: id, OptionID: "place:0:5", PlayerID: "p2"}, {Type: ActResolveChoice, ChoiceID: "old", OptionID: "place:0:5"}, {Type: ActResolveChoice, ChoiceID: id, OptionID: "place:0:5", CardID: "move-1"}, {Type: ActSearch, PawnID: "drone-probe"}, {Type: ActMoveSteps, PawnID: "drone-probe"}} {
		restrictionReject(t, f.s, f.gd, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase bypass")
	}
	after := *f.s.RNG
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil || rng.Intn(100000) != after.Intn(100000) || view.RevealedBlock.BlockID != "engineering-war" || len(view.Options) != 0 {
		t.Fatal("committed reveal visibility/RNG", err)
	}
	probeFinishSearch(t, f)
	restrictionReject(t, f.s, f.gd, Action{Type: ActSearch, PawnID: "drone-probe"})
}
func TestDroneProbeSearchAndMovementUsesAreIndependentAndPaidMoveDoesNotRefresh(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	probeSearch(t, f)
	probeFinishSearch(t, f)
	hand := slices.Clone(f.s.Players[0].Hand)
	rng := *f.s.RNG
	probeMove(t, f)
	after := *f.s.RNG
	m := probeMarkers(f.s)
	if !slices.Equal(hand, f.s.Players[0].Hand) || len(m) != 2 || m[0].Ability != "search" || m[1].Ability != "move" || m[0].Uses != 1 || m[1].Uses != 1 || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("independent free sources")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActSearch, PawnID: "drone-probe"})
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-probe"})
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: "drone-probe", CardID: "move-1"})
	m = probeMarkers(f.s)
	if len(m) != 2 || m[0].Uses != 1 || m[1].Uses != 1 {
		t.Fatal("paid movement refreshed native")
	}
}
func TestDroneProbeEmptyPileAndSealedReferenceRejectBeforeSpendingSearch(t *testing.T) {
	for _, sealed := range []bool{false, true} {
		f := probeFixture(t)
		probePrepare(t, f)
		if !sealed {
			f.s.BlockPile = []string{}
		} else {
			for i, dir := range []int{0, 1, 4} {
				id := []string{"engineering-war", "pink-district", "black-clinic"}[i]
				rot := 0
				if id == "engineering-war" {
					rot = 5
				}
				f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: id, Coord: (domain.Coord{Q: 1}).Neighbor(dir), Rotation: rot})
				f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(b string) bool { return b == id })
			}
		}
		if slices.ContainsFunc(AvailableActions(f.s, f.gd), func(o AvailableAction) bool { return o.Action.Type == ActSearch && o.Action.PawnID == "drone-probe" }) {
			t.Fatal("unavailable Search exposed")
		}
		restrictionReject(t, f.s, f.gd, Action{Type: ActSearch, PawnID: "drone-probe"})
		if len(probeMarkers(f.s)) != 0 {
			t.Fatal("rejection spent native Search")
		}
	}
}
func TestDroneProbeTakeoverRefundsAndPreservesBothUsesUntilNewControllerBeginning(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-probe", CardID: "servocanon"})
	probeSearch(t, f)
	probeFinishSearch(t, f)
	probeMove(t, f)
	engineeringTurn(t, f)
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-probe"}}})
	f.s.RNG = domain.NewRNG(5)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.target, CardID: "move-1", Coord: &domain.Coord{Q: 1}})
	p := f.s.Cybernet.PawnByID("drone-probe")
	m := probeMarkers(f.s)
	if p.OwnerID != "p2" || p.Coord != (domain.Coord{Q: 1}) || p.SpaceID != "drone-probe" || len(p.Attachments) != 0 || f.s.Players[0].BonusCounters != 1 || len(m) != 2 || m[0].OwnerID != "p2" || m[1].OwnerID != "p2" || m[0].Uses != 1 || m[1].Uses != 1 {
		t.Fatal("takeover native/module accounting")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActSearch, PawnID: "drone-probe"})
	restrictionReject(t, f.s, f.gd, Action{Type: ActMoveSteps, PawnID: "drone-probe"})
	engineeringTurn(t, f)
	if len(probeMarkers(f.s)) != 2 {
		t.Fatal("old controller cleared uses")
	}
	engineeringTurn(t, f)
	if len(probeMarkers(f.s)) != 0 || !slices.ContainsFunc(AvailableActions(f.s, f.gd), func(o AvailableAction) bool { return o.Action.Type == ActSearch && o.Action.PawnID == "drone-probe" }) {
		t.Fatal("new controller beginning did not clear")
	}
}
func TestDroneProbeSearchSprawlShortfallRetainsFrameAndEMPMaySacrificeSearcherAfterPlacement(t *testing.T) {
	short := probeFixture(t)
	probePrepare(t, short)
	short.s.Deck = append(short.s.Deck, short.s.Players[0].Hand...)
	short.s.Players[0].Hand = []string{}
	short.s.BlockPile = slices.DeleteFunc(short.s.BlockPile, func(id string) bool { return id == "chiba-city" })
	short.s.BlockPile = append(short.s.BlockPile, "chiba-city")
	probeSearch(t, short)
	var a Action
	for _, option := range AvailableActions(short.s, short.gd)[0].Responses {
		if option.OptionID == "place:0:0" {
			a = option
		}
	}
	before := Snapshot(short.s)
	rng := *short.s.RNG
	r := ApplyWithEvents(short.s, short.gd, a)
	after := *short.s.RNG
	if r.Accepted || !strings.Contains(r.Error, "shortfall") || Snapshot(short.s) != before || rng.Intn(100000) != after.Intn(100000) || short.s.PendingChoice.BlockID != "chiba-city" || probeMarkers(short.s)[0].Uses != 1 {
		t.Fatal("shortfall undid native reveal", r)
	}
	f := probeFixture(t)
	probePrepare(t, f)
	f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(id string) bool { return id == "electromagnetic-pulse" })
	f.s.BlockPile = append(f.s.BlockPile, "electromagnetic-pulse")
	probeSearch(t, f)
	for _, option := range AvailableActions(f.s, f.gd)[0].Responses {
		if option.OptionID == "place:0:0" {
			a = option
		}
	}
	antroAccept(t, f, a)
	if f.s.PendingChoice.Kind != "block-sacrifice" {
		t.Fatal("placement did not open sacrifice")
	}
	for _, option := range AvailableActions(f.s, f.gd)[0].Responses {
		if option.TargetID == "drone-probe" {
			a = option
		}
	}
	antroAccept(t, f, a)
	m := probeMarkers(f.s)
	if !slices.Contains(f.s.Reserve, "drone-probe") || len(m) != 1 || m[0].Ability != "search" || m[0].Uses != 1 || m[0].OwnerID != "" || f.s.PendingChoice != nil {
		t.Fatal("searcher sacrifice physical resolution")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-probe" && (c.OwnerID != "" || c.Zone != "common") {
			t.Fatal("sacrificed source card")
		}
	}
}
func TestDroneProbeModuleSingleFreeDeleteRemainsSeparateFromSearchAndPaidDelete(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	slots := PawnAttachmentSlots(f.gd, f.s.Cybernet.PawnByID("drone-probe"))
	if len(slots) != 1 || slots[0].Ref != "pawn:module" {
		t.Fatal("printed Module slot")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "drone-probe", CardID: "move-1"})
	antroAccept(t, f, Action{Type: ActAttachPawn, TargetID: "drone-probe", CardID: "servocanon"})
	p, _ := f.gd.PawnByID("drone-probe")
	profile := PawnDeleteProfile(f.gd, p, f.s.Cybernet.PawnByID("drone-probe").Attachments)
	if f.s.Players[0].BonusCounters != 0 || profile.Skulls != 1 || profile.Card || profile.FreeActivators != 1 {
		t.Fatal("module's distinct free Delete")
	}
	probeSearch(t, f)
	probeFinishSearch(t, f)
	antroAccept(t, f, Action{Type: ActRollDelete, PawnID: "drone-probe"})
	antroAccept(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{""}})
	m := probeMarkers(f.s)
	if len(m) != 2 || m[0].Ability != "search" || m[1].Ability != "delete" {
		t.Fatal("independent native/attached marker")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "drone-probe", CardID: "move-1"})
	restrictionReject(t, f.s, f.gd, Action{Type: ActRollDelete, PawnID: "drone-probe"})
}
func TestCombatPrototypesProbeReleasePoolRollbackAndImmediateVictoryAccounting(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	probeSearch(t, f)
	probeFinishSearch(t, f)
	cards := sprawlInventory(f.s)
	if !eliminatePawn(f.s, "drone-probe", f.gd) || !slices.Contains(f.s.Reserve, "drone-probe") || slices.Contains(f.s.Eliminated, "drone-probe") || probeMarkers(f.s)[0].OwnerID != "" || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("non-Reboot source release")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == "drone-probe" && (c.OwnerID != "" || c.Zone != "common") {
			t.Fatal("common card")
		}
	}
	bad := probeFixture(t)
	probePlace(t, bad)
	bad.s.Reserve = slices.DeleteFunc(bad.s.Reserve, func(id string) bool { return id == "drone-probe" })
	antroAccept(t, bad, Action{Type: ActPlayMove, PawnID: bad.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}, {Coord: domain.Coord{Q: 1}, SpaceID: "drone-probe"}}})
	bad.s.RNG = domain.NewRNG(5)
	restrictionReject(t, bad.s, bad.gd, Action{Type: ActPlayIcebreakBlk, PawnID: bad.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	if !slices.Contains(bad.s.Players[0].Hand, "worm") {
		t.Fatal("rollback payment")
	}
	win := probeFixture(t)
	win.s.Players[0].ControlMarkersTotal = 1
	probePrepare(t, win)
	if win.s.WinnerID != "p1" || !slices.Contains(win.s.Reserve, "drone-probe") || win.s.Cybernet.PawnByID("drone-probe") != nil {
		t.Fatal("victory deployment suppression")
	}
}
func TestDroneProbeNoPaidSearchFallbackUnprintedAbilitiesTopologyAndDetachedClones(t *testing.T) {
	f := probeFixture(t)
	probePrepare(t, f)
	for _, a := range []Action{{Type: ActPlaySearch, PawnID: "drone-probe", CardID: "move-1"}, {Type: ActSearch, PawnID: "drone-probe", CardID: "move-1"}, {Type: ActSearch, PawnID: "drone-probe", PlayerID: "p2"}, {Type: ActRollDelete, PawnID: "drone-probe"}, {Type: ActIcebreakBlk, PawnID: "drone-probe", Coord: &domain.Coord{Q: 1}}, {Type: ActReboot, PawnID: "drone-probe"}} {
		restrictionReject(t, f.s, f.gd, a)
	}
	ids := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1}, "drone-probe", "drone-probe") {
		ids = append(ids, ref.SpaceID)
	}
	if !slices.Equal(ids, []string{"upper-left", "right", "lower-right", "left"}) {
		t.Fatal("exact central links")
	}
	probeSearch(t, f)
	before := Snapshot(f.s)
	cloned := CloneState(f.s)
	cloned.PendingChoice.Reference.Q = 99
	cloned.NativeUseMarkers[0].Uses = 99
	view, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	view.UseMarkers[0].Uses = 99
	if Snapshot(f.s) != before {
		t.Fatal("clone/view aliased native decision")
	}
}
func TestCombatPrototypesProbeStrictSharedHandlerConstructionAndMissingMatchingCard(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "combat-prototypes" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter && p.ID != "drone-probe" })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter && c.Subject.ID != "drone-probe" })
	gd.Cards = []domain.ActionCard{}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || !slices.Contains(s.Reserve, "drone-probe") {
		t.Fatal("isolated source strict", err)
	}
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return c.Subject.ID == "drone-probe" })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
		t.Fatal("missing physical matching card accepted")
	}
}
