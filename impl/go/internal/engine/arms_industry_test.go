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

func armsFixture(t *testing.T, formation bool) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "move-1", "move-2", "worm", "dummy"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-2", "move-1"} {
		f.take(t, 1, id)
	}
	if formation {
		core, _ := gd.BlockByID("central-core")
		for i, c := range []domain.Coord{{Q: 2}, {Q: 2, R: -1}} {
			peer := *core
			peer.ID = []string{"fixture-arms-peer-a", "fixture-arms-peer-b"}[i]
			peer.Name = "Synthetic Arms bonus peer"
			peer.IsCentralCore = false
			peer.BonusCorners = []bool{true, true, true, true, true, true}
			peer.Provisional = true
			gd.Blocks = append(gd.Blocks, peer)
			s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: peer.ID, Coord: c, OwnerID: "p1"})
		}
		s.Players[0].ControlMarkersPlaced = 2
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "arms-industry" })
	s.BlockPile = append(s.BlockPile, "arms-industry")
	return f
}
func armsReveal(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func armsPlace(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
}
func armsEnter(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}}})
}
func armsCapture(t *testing.T, f malwareFixture, pawn, card string) TransitionResult {
	f.s.RNG = domain.NewRNG(5)
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: pawn, CardID: card, Coord: &domain.Coord{Q: 1}})
}
func armsTile(f malwareFixture) *domain.PlacedBlock { return f.s.Cybernet.At(domain.Coord{Q: 1}) }
func TestArmsIndustryBilingualFundedPlacementCollectionAndSharedByteEvidence(t *testing.T) {
	f := armsFixture(t, true)
	b, _ := f.gd.BlockByID("arms-industry")
	if !reflect.DeepEqual(b.Edges, []bool{true, false, false, true, true, true}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"upper-right"}, {}, {}, {"hand"}, {"left"}, {"upper-left"}}) || !slices.Equal(b.IceFaces, []int{6}) || !b.BlackIce || !reflect.DeepEqual(b.BonusCorners, []bool{false, true, true, true, false, true}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1", "h4", "h5"}) || len(b.Spaces) != 4 || b.Effects.InCybernet.Kind != "place-block-bonus" || b.Effects.InCybernet.Amount != 1 || b.Effects.UnderControl.Kind != "collect-block-bonus" || !b.Provisional {
		t.Fatal("source facts")
	}
	for _, sp := range b.Spaces {
		if sp.Capacity != domain.ExplicitSpaceCapacity(1) {
			t.Fatal("single capacity")
		}
	}
	copyleftGrant(t, f.s, "p1", 22)
	initial := Snapshot(f.s)
	drawn := armsReveal(t, f)
	pending := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	placed := armsPlace(t, f)
	held := Snapshot(f.s)
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	allocated, _ := BonusCounterPool(f.s)
	moved := armsEnter(t, f)
	captured := armsCapture(t, f, f.actor, "worm")
	pool, _ := BonusCounterPool(f.s)
	got := map[string]any{"initial": initial, "pending": pending, "options": options, "held": held, "view": view, "allocated": allocated, "finished": Snapshot(f.s), "pool": pool, "events": [][]EngineEvent{drawn.Events, placed.Events, moved.Events, captured.Events}}
	encoded, _ := json.Marshal(got)
	var actual, expected any
	json.Unmarshal(encoded, &actual)
	json.Unmarshal([]byte(readGolden(t, "arms-industry.json")), &expected)
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("shared Arms evidence differs")
	}
}
func TestArmsRevealAllocatesNothingPlacementHasOnePublicDetachedCounterAndPureOptions(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	pool, _ := BonusCounterPool(f.s)
	if pool.OnBoard != 0 {
		t.Fatal("reveal allocated")
	}
	before := Snapshot(f.s)
	rng := *f.s.RNG
	ids := []string{}
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if strings.HasPrefix(a.OptionID, "place:0:") {
			ids = append(ids, a.OptionID)
		}
	}
	afterRNG := *f.s.RNG
	if !slices.Equal(ids, []string{"place:0:0", "place:0:3", "place:0:4", "place:0:5"}) || Snapshot(f.s) != before || rng.Intn(100000) != afterRNG.Intn(100000) {
		t.Fatal("pure rotations")
	}
	armsPlace(t, f)
	pool, _ = BonusCounterPool(f.s)
	if armsTile(f).BonusCounter == nil || *pool != (BonusPool{Supply: 24, Reserve: 23, OnBoard: 1}) {
		t.Fatal("physical allocation")
	}
	copy := CloneState(f.s)
	copy.Cybernet.At(domain.Coord{Q: 1}).BonusCounter.CollectedBy = "p1"
	v, _ := PlayerView(f.s, f.gd, "p2")
	for i := range v.Blocks {
		if v.Blocks[i].BlockID == "arms-industry" {
			v.Blocks[i].BonusCounter.CollectedBy = "p2"
		}
	}
	if armsTile(f).BonusCounter.CollectedBy != "" {
		t.Fatal("view/clone alias")
	}
}
func TestArmsPlacementShortagePreservesAcceptedRevealAndRNGWithoutExecutableOptions(t *testing.T) {
	f := armsFixture(t, false)
	copyleftGrant(t, f.s, "p1", 24)
	armsReveal(t, f)
	if len(AvailableActions(f.s, f.gd)[0].Responses) != 0 {
		t.Fatal("unfunded options")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	if f.s.PendingChoice.BlockID != "arms-industry" || !slices.Equal(f.s.Discard, []string{"dj"}) || armsTile(f) != nil {
		t.Fatal("accepted reveal lost")
	}
}
func TestArmsCombinedIconAndBlockFundingAndCollectionAtEmptyReserve(t *testing.T) {
	short := armsFixture(t, true)
	copyleftGrant(t, short.s, "p1", 23)
	armsReveal(t, short)
	restrictionReject(t, short.s, short.gd, Action{Type: ActResolveChoice, ChoiceID: short.s.PendingChoice.ID, OptionID: "place:0:0"})
	if len(short.s.Cybernet.BonusIcons) != 0 {
		t.Fatal("partial allocation")
	}
	f := armsFixture(t, true)
	copyleftGrant(t, f.s, "p1", 22)
	armsReveal(t, f)
	placed := armsPlace(t, f)
	elements := []string{}
	for _, e := range placed.Events {
		if e.Type == EventBonusCounterPlaced {
			elements = append(elements, e.Element)
		}
	}
	pool, _ := BonusCounterPool(f.s)
	if !slices.Equal(elements, []string{"bonus-icon", "block"}) || *pool != (BonusPool{Supply: 24, Free: 22, OnBoard: 2}) {
		t.Fatal("allocation order/funding")
	}
	armsEnter(t, f)
	r := armsCapture(t, f, f.actor, "worm")
	elements = []string{}
	for _, e := range r.Events {
		if e.Type == EventBonusCollected {
			elements = append(elements, e.Element)
		}
	}
	pool, _ = BonusCounterPool(f.s)
	if !slices.Equal(elements, []string{"bonus-icon", "block"}) || *pool != (BonusPool{Supply: 24, Free: 24}) || armsTile(f).BonusCounter.CollectedBy != "p1" {
		t.Fatal("transfer order/conservation")
	}
}
func TestArmsTakeoverNeverMintsASecondCounterOrChangesReceipt(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	armsCapture(t, f, f.actor, "worm")
	cards := sprawlInventory(f.s)
	if f.s.Players[0].BonusCounters != 1 {
		t.Fatal("collect")
	}
	engineeringTurn(t, f)
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.target, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "hand"}, {Coord: domain.Coord{Q: 1}, SpaceID: "left"}}})
	r := armsCapture(t, f, f.target, "move-1")
	for _, e := range r.Events {
		if e.Type == EventBonusCollected {
			t.Fatal("second award")
		}
	}
	if armsTile(f).OwnerID != "p2" || armsTile(f).BonusCounter.CollectedBy != "p1" || f.s.Players[0].BonusCounters != 1 || f.s.Players[1].BonusCounters != 0 || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("receipt/inventory")
	}
	if _, err := ApplyBlockEffectForTrigger(f.s, f.gd, domain.Coord{Q: 1}, BlockEffectInCybernet); err == nil {
		t.Fatal("repeated placement")
	}
}
func TestArmsBlackICEFailureRetainsCounterAndPaidCardWithStarterElimination(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	cards := sprawlInventory(f.s)
	f.s.RNG = domain.NewRNG(1)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	pool, _ := BonusCounterPool(f.s)
	if !slices.Contains(f.s.Eliminated, f.actor) || armsTile(f).OwnerID != "" || armsTile(f).BonusCounter.CollectedBy != "" || !slices.Contains(f.s.PlayedCards, "worm") || pool.OnBoard != 1 || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("Black ICE cleanup/accounting")
	}
}
func TestArmsDummyResponseDoesNotCollectRerollOrLoseCounter(t *testing.T) {
	f := armsFixture(t, false)
	copyleftGrant(t, f.s, "p1", 1)
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.actor})
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	f.s.RNG = domain.NewRNG(1)
	antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	if f.s.PendingChoice == nil || f.s.PendingChoice.Kind != "prevent-elimination" {
		t.Fatal("prevention")
	}
	rng := *f.s.RNG
	restrictionReject(t, f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "prevent", PlayerID: "p2"})
	for _, a := range AvailableActions(f.s, f.gd)[0].Responses {
		if a.OptionID == "prevent" {
			antroAccept(t, f, a)
			break
		}
	}
	after := *f.s.RNG
	if f.s.Cybernet.PawnByID(f.actor) == nil || armsTile(f).BonusCounter.CollectedBy != "" || rng.Intn(100000) != after.Intn(100000) || f.s.Players[0].BonusCounters != 1 {
		t.Fatal("Dummy cleanup/counter")
	}
}
func TestArmsMissingOrCorruptCounterRollsBackSuccessfulCapturePaymentAndRNG(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	armsTile(f).BonusCounter = nil
	f.s.RNG = domain.NewRNG(5)
	a := Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}}
	restrictionReject(t, f.s, f.gd, a)
	if armsTile(f).OwnerID != "" {
		t.Fatal("capture leaked")
	}
	armsTile(f).BonusCounter = &domain.BlockBonusCounter{CollectedBy: "unknown"}
	restrictionReject(t, f.s, f.gd, a)
}
func TestArmsImmediateVictorySuppressesCollectionWithoutLosingPhysicalCounter(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	f.s.Players[0].ControlMarkersTotal = 1
	r := armsCapture(t, f, f.actor, "worm")
	pool, _ := BonusCounterPool(f.s)
	if f.s.WinnerID != "p1" || armsTile(f).BonusCounter.CollectedBy != "" || f.s.Players[0].BonusCounters != 0 || pool.OnBoard != 1 {
		t.Fatal("victory")
	}
	for _, e := range r.Events {
		if e.Type == EventBonusCollected && e.Element == "block" {
			t.Fatal("collected after victory")
		}
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActPass})
}
func TestArmsStorageAndArtworkHaveNoMovementSpaceAndHandLimitFollowsStoppedControl(t *testing.T) {
	f := armsFixture(t, false)
	armsReveal(t, f)
	armsPlace(t, f)
	armsEnter(t, f)
	p, _ := HandSizeProfileFor(f.s, f.gd, "p1")
	if p.Spaces != -1 {
		t.Fatal("hand limit")
	}
	for _, id := range []string{"h1", "counter", "core", "h4", "h5"} {
		restrictionReject(t, f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: id}}})
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}}})
	p, _ = HandSizeProfileFor(f.s, f.gd, "p1")
	if p.Spaces != 0 {
		t.Fatal("stale space modifier")
	}
}
func TestArmsMalformedPairsAndDisguisedOfficialContentRejectInsteadOfIgnoring(t *testing.T) {
	for _, kind := range []string{"missing-collect", "wrong-timing", "amount", "target", "optional"} {
		f := armsFixture(t, false)
		b, _ := f.gd.BlockByID("arms-industry")
		switch kind {
		case "missing-collect":
			b.Effects.UnderControl = nil
		case "wrong-timing":
			b.Effects.InCybernet, b.Effects.UnderControl = b.Effects.UnderControl, b.Effects.InCybernet
		case "amount":
			b.Effects.InCybernet.Amount = 2
		case "target":
			b.Effects.UnderControl.Target = "p1"
		case "optional":
			b.Effects.UnderControl.Optional = true
		}
		if _, err := NewGame(Config{Data: f.gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
			t.Fatal(kind)
		}
	}
	f := armsFixture(t, false)
	f.gd.Blocks = slices.DeleteFunc(f.gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "arms-industry" })
	for i := range f.gd.Blocks {
		f.gd.Blocks[i].Provisional = false
	}
	f.gd.Cards = []domain.ActionCard{}
	f.gd.Pawns = slices.DeleteFunc(f.gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	f.gd.ControlCards = slices.DeleteFunc(f.gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	if _, err := NewGame(Config{Data: f.gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "shortfall policy") {
		t.Fatal(err)
	}
}
