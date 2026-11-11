package engine

import (
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func copyleftFixture(t *testing.T, formation bool, names ...string) malwareFixture {
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
	for _, id := range []string{"dj", "phase-loop", "worm", "move-2", "octagon-dex"} {
		f.take(t, 0, id)
	}
	if formation {
		for _, entry := range []struct {
			id    string
			coord domain.Coord
		}{{"fixture-peer-a", domain.Coord{Q: 2, R: -1}}, {"fixture-peer-b", domain.Coord{Q: 1, R: -1}}} {
			core, _ := gd.BlockByID("central-core")
			peer := *core
			peer.ID = entry.id
			peer.Name = "Synthetic bonus peer"
			peer.IsCentralCore = false
			peer.BonusCorners = []bool{true, true, true, true, true, true}
			peer.Provisional = true
			gd.Blocks = append(gd.Blocks, peer)
			s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: entry.id, Coord: entry.coord})
		}
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "copyleft" })
	s.BlockPile = append(s.BlockPile, "copyleft")
	return f
}
func copyleftGrant(t *testing.T, s *domain.GameState, id string, amount int) {
	t.Helper()
	if err := GrantBonusCounters(s, id, amount); err != nil {
		t.Fatal(err)
	}
}
func copyleftPool(t *testing.T, s *domain.GameState) *BonusPool {
	t.Helper()
	p, err := BonusCounterPool(s)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func copyleftReveal(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func copyleftPlace(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
}
func copyleftCollect(t *testing.T, f malwareFixture) TransitionResult {
	actor := f.s.Cybernet.PawnByID(f.actor)
	actor.Coord = domain.Coord{Q: 1}
	actor.SpaceID = "portrait"
	for _, b := range f.s.Cybernet.Blocks {
		if strings.HasPrefix(b.BlockID, "fixture-peer") {
			b.OwnerID = "p1"
		}
	}
	f.s.Players[0].ControlMarkersPlaced = 2
	f.s.RNG = domain.NewRNG(1)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &actor.Coord})
}

func TestCopyleftGeometryArtworkAndSharedPhysicalCounterEvidence(t *testing.T) {
	f := copyleftFixture(t, true)
	b, _ := f.gd.BlockByID("copyleft")
	if !reflect.DeepEqual(b.IceFaces, []int{2, 3, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, true, false, false, true, false}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"headset"}, {"right"}, {"portrait"}, {"portrait"}, {"shield"}, {"shield"}}) || !reflect.DeepEqual(b.SpaceArrows, []domain.SpaceArrow{{From: "headset", To: "right"}}) || !reflect.DeepEqual(b.Spaces[0].Modifier.Dice, []domain.DefenseDie{{Value: 4, Shielded: true}}) || f.gd.Mode.BonusCounterSupply == nil || *f.gd.Mode.BonusCounterSupply != 24 {
		t.Fatal("printed geometry/supply")
	}
	for i, sp := range b.Spaces {
		if sp.Type != "normal" || sp.PawnID != "" || sp.Capacity != []domain.ExplicitSpaceCapacity{2, 1, 1, 2}[i] {
			t.Fatal("artwork is not a pawn")
		}
	}
	copyleftGrant(t, f.s, "p1", 21)
	initial := Snapshot(f.s)
	drawn := copyleftReveal(t, f)
	options := AvailableActions(f.s, f.gd)
	revealed := Snapshot(f.s)
	placed := copyleftPlace(t, f)
	onBoard := Snapshot(f.s)
	allocated := copyleftPool(t, f.s)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	collected := copyleftCollect(t, f)
	antroSharedJSON(t, "copyleft.json", map[string]any{"initial": initial, "revealed": revealed, "options": options, "onBoard": onBoard, "allocated": allocated, "view": view, "finished": Snapshot(f.s), "pool": copyleftPool(t, f.s), "events": [][]EngineEvent{drawn.Events, placed.Events, collected.Events}})
}
func TestPhysicalBonusAllocationPriorityTransferAndRefundConservation(t *testing.T) {
	f := copyleftFixture(t, true)
	inventory := sprawlInventory(f.s)
	copyleftGrant(t, f.s, "p1", 21)
	rng := *f.s.RNG
	before := []domain.PawnOnBoard{}
	for _, p := range f.s.Cybernet.Pawns {
		before = append(before, *p)
	}
	copyleftReveal(t, f)
	placed := copyleftPlace(t, f)
	types := []EventType{}
	for _, e := range placed.Events {
		types = append(types, e.Type)
	}
	if !slices.Equal(types, []EventType{EventChoiceResolved, EventBlockPlaced, EventBonusIconCreated, EventBonusCounterPlaced, EventBonusAwarded, EventBonusAwarded}) || *copyleftPool(t, f.s) != (BonusPool{Supply: 24, Reserve: 0, Free: 23, OnBoard: 1}) || !f.s.Cybernet.BonusIcons[0].CounterPlaced {
		t.Fatal("allocation before award", types)
	}
	after := []domain.PawnOnBoard{}
	for _, p := range f.s.Cybernet.Pawns {
		after = append(after, *p)
	}
	check := *f.s.RNG
	if !reflect.DeepEqual(before, after) || check.Intn(100000) != rng.Intn(100000) {
		t.Fatal("phantom pawn or RNG")
	}
	r := copyleftCollect(t, f)
	count := 0
	for _, e := range r.Events {
		if e.Type == EventBonusCollected {
			count++
		}
	}
	if count != 1 || f.s.Players[0].BonusCounters != 23 || f.s.Players[1].BonusCounters != 1 || *copyleftPool(t, f.s) != (BonusPool{Supply: 24, Reserve: 0, Free: 24}) {
		t.Fatal("board counter transfer")
	}
	if more, err := CollectControlledBonusIcons(f.s, "p1"); err != nil || len(more) != 0 {
		t.Fatal("duplicate collection", err)
	}
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "phase-loop", TargetID: f.actor})
	if *copyleftPool(t, f.s) != (BonusPool{Supply: 24, Free: 23, Invested: 1}) {
		t.Fatal("investment")
	}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor), 0, nil)
	if copyleftPool(t, f.s).Free != 24 || !reflect.DeepEqual(inventory, sprawlInventory(f.s)) {
		t.Fatal("refund/cards")
	}
}
func TestCopyleftReserveShortfallPreservesRevealAndPureFundedOptions(t *testing.T) {
	f := copyleftFixture(t, true)
	copyleftGrant(t, f.s, "p1", 22)
	copyleftReveal(t, f)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	responses := AvailableActions(f.s, f.gd)[0].Responses
	if len(responses) == 0 {
		t.Fatal("all orientations hidden")
	}
	for _, a := range responses {
		if a.OptionID == "place:0:0" {
			t.Fatal("unfunded orientation offered")
		}
	}
	check := *f.s.RNG
	if Snapshot(f.s) != before || check.Intn(100000) != rng.Intn(100000) {
		t.Fatal("preview changed state/RNG")
	}
	a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"}
	antroReject(t, f, a)
	r := ApplyWithEvents(f.s, f.gd, a)
	if !strings.Contains(r.Error, "reserve shortfall") || f.s.Players[0].BonusCounters != 22 || f.s.Players[1].BonusCounters != 0 || !reflect.DeepEqual(f.s.Discard, []string{"dj"}) || len(f.s.Cybernet.BonusIcons) != 0 {
		t.Fatal("paid reveal/award atomicity", r)
	}
	g := copyleftFixture(t, false, "A", "B", "C", "D")
	copyleftGrant(t, g.s, "p1", 21)
	copyleftReveal(t, g)
	if len(AvailableActions(g.s, g.gd)[0].Responses) != 0 {
		t.Fatal("underfunded four-player award")
	}
	antroReject(t, g, Action{Type: ActResolveChoice, ChoiceID: g.s.PendingChoice.ID, OptionID: "place:0:0"})
}
func TestCopyleftFourPlayerAwardAndDetachedPublicPoolQueries(t *testing.T) {
	f := copyleftFixture(t, false, "A", "B", "C", "D")
	target := f.s.Players[3].PawnID
	f.s.Cybernet.RemovePawn(target)
	f.s.Eliminated = append(f.s.Eliminated, target)
	reserve := append([]string{}, f.s.Reserve...)
	copyleftReveal(t, f)
	copyleftPlace(t, f)
	for _, p := range f.s.Players {
		if p.BonusCounters != 1 {
			t.Fatal("global recipient")
		}
	}
	if copyleftPool(t, f.s).Reserve != 20 || !reflect.DeepEqual(reserve, f.s.Reserve) || len(f.s.Cybernet.Pawns) != 3 {
		t.Fatal("unexpected pawn placement")
	}
	before := Snapshot(f.s)
	view, err := PlayerView(f.s, f.gd, "p4")
	if err != nil {
		t.Fatal(err)
	}
	copy := CloneState(f.s)
	*copy.BonusCounterSupply = 0
	view.BonusPool.Reserve = 0
	if Snapshot(f.s) != before {
		t.Fatal("pool alias")
	}
}
func TestCopyleftPrintedArrowAndDefenseUseExistingGraph(t *testing.T) {
	f := copyleftFixture(t, false)
	copyleftReveal(t, f)
	copyleftPlace(t, f)
	actor := f.s.Cybernet.PawnByID(f.actor)
	actor.Coord = domain.Coord{Q: 1}
	actor.SpaceID = "headset"
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: actor.Coord, SpaceID: "right"}}})
	for _, target := range StepTargets(f.gd, f.s.Cybernet, actor.Coord, "right", f.actor) {
		if target.SpaceID == "headset" {
			t.Fatal("reverse arrow")
		}
	}
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "octagon-dex", TargetID: f.actor})
	found := false
	for _, target := range StepTargets(f.gd, f.s.Cybernet, actor.Coord, "right", f.actor) {
		found = found || target.SpaceID == "headset"
	}
	if !found {
		t.Fatal("Octagon exception")
	}
	actor.SpaceID = "shield"
	profile, err := DefenseProfile(f.s, f.gd, actor)
	if err != nil {
		t.Fatal(err)
	}
	for _, die := range profile {
		if die.Value == 4 && !die.Shielded {
			t.Fatal("shielded4")
		}
	}
}
func TestPhysicalBonusCardThreatGuardsAndInvalidAllocationRejection(t *testing.T) {
	f := copyleftFixture(t, false)
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-award", Name: "Synthetic award", Effects: []domain.CardEffect{{Kind: "gain-bonus", Trigger: "on-play", Amount: 1}}})
	copyleftGrant(t, f.s, "p1", 23)
	if result, err := ApplyCardEffectsForTrigger(f.s, f.gd, "p2", "fixture-award", "on-play", nil); err != nil || len(result) != 1 {
		t.Fatal(err)
	}
	before := Snapshot(f.s)
	if _, err := ApplyCardEffectsForTrigger(f.s, f.gd, "p2", "fixture-award", "on-play", nil); err == nil || Snapshot(f.s) != before {
		t.Fatal("card reserve guard")
	}
	f.gd.Threats = []domain.Threat{{ID: "fixture-token", Name: "Synthetic token", Type: "token"}}
	f.s.Threats = []domain.ThreatOnBoard{{ID: "token-1", ThreatID: "fixture-token", Coord: domain.Coord{}, SpaceID: "core", Status: "eliminated"}}
	antroReject(t, f, Action{Type: ActCollectThreat, PawnID: f.actor, TargetID: "token-1"})
	if len(f.s.Threats) != 1 {
		t.Fatal("token removed on shortfall")
	}
	f.s.Players[0].BonusCounters--
	antroAccept(t, f, Action{Type: ActCollectThreat, PawnID: f.actor, TargetID: "token-1"})
	if copyleftPool(t, f.s).Reserve != 0 {
		t.Fatal("threat award")
	}
	f.s.Players[0].BonusCounters = 25
	if _, err := BonusCounterPool(f.s); err == nil {
		t.Fatal("over-allocation accepted")
	}
	antroReject(t, f, Action{Type: ActPass})
}
func TestPhysicalBonusRegressionAndOfficialReadinessGates(t *testing.T) {
	old, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: old, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	copyleftGrant(t, s, "p1", 1000)
	if p, err := BonusCounterPool(s); p != nil || err != nil || strings.Contains(Snapshot(s), "bonusCounterSupply") {
		t.Fatal("frozen semantics")
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return b.ID != "central-core" && b.ID != "copyleft" })
	for i := range gd.Blocks {
		gd.Blocks[i].Provisional = false
	}
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.Cards = nil
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "global bonus reserve") {
		t.Fatal("strict shortage gate", err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore })
	negative := -1
	gd.Mode.BonusCounterSupply = &negative
	if _, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
		t.Fatal("negative supply")
	}
	gd.Mode.BonusCounterSupply = nil
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "configured physical") {
		t.Fatal("missing physical supply", err)
	}
}

func TestCopyleftMalformedAmountsTargetsAndTiming(t *testing.T) {
	for _, effect := range []domain.BlockEffects{{InCybernet: &domain.BlockEffect{Kind: "gain-bonus-all-players", Amount: 0}}, {InCybernet: &domain.BlockEffect{Kind: "gain-bonus-all-players", Amount: 1, Target: "eko"}}, {UnderControl: &domain.BlockEffect{Kind: "gain-bonus-all-players", Amount: 1}}} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("copyleft")
		b.Effects = effect
		if _, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "award descriptor") {
			t.Fatal("malformed global award", err)
		}
	}
}

func TestPhysicalBonusMultipleIconsAndStandalonePlacementRollback(t *testing.T) {
	addPeer := func(f malwareFixture) {
		core, _ := f.gd.BlockByID("central-core")
		peer := *core
		peer.ID = "fixture-peer-c"
		peer.Name = "Synthetic bonus peer"
		peer.IsCentralCore = false
		peer.BonusCorners = []bool{true, true, true, true, true, true}
		peer.Provisional = true
		f.gd.Blocks = append(f.gd.Blocks, peer)
		f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: peer.ID, Coord: domain.Coord{Q: 2}})
	}
	f := copyleftFixture(t, true)
	addPeer(f)
	copyleftGrant(t, f.s, "p1", 23)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	if _, err := PlaceBlock(f.s, domain.Coord{}, 0, f.gd, "copyleft", 0); err == nil || !strings.Contains(err.Error(), "reserve shortfall") {
		t.Fatal("standalone placement budget", err)
	}
	check := *f.s.RNG
	if Snapshot(f.s) != before || check.Intn(100000) != rng.Intn(100000) {
		t.Fatal("standalone placement rollback")
	}
	g := copyleftFixture(t, true)
	addPeer(g)
	copyleftGrant(t, g.s, "p1", 20)
	copyleftReveal(t, g)
	r := copyleftPlace(t, g)
	count := 0
	for _, e := range r.Events {
		if e.Type == EventBonusCounterPlaced {
			count++
		}
	}
	for _, icon := range g.s.Cybernet.BonusIcons {
		if !icon.CounterPlaced {
			t.Fatal("unfunded icon")
		}
	}
	if count != 2 || *copyleftPool(t, g.s) != (BonusPool{Supply: 24, Reserve: 0, Free: 22, OnBoard: 2}) {
		t.Fatal("all icon allocations", count)
	}
}
