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

func corporateFixture(t *testing.T, counts []int, idoru bool) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for i := range counts {
		names = append(names, string(rune('A'+i)))
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
	for _, id := range []string{"dj", "move-2", "worm", "move-1", "move-1"} {
		f.take(t, 0, id)
	}
	for _, id := range []string{"move-1", "move-1", "move-2"} {
		f.take(t, 1, id)
	}
	for i := 2; i < len(counts); i++ {
		f.take(t, i, "move-3")
	}
	if idoru {
		s.Reserve = slices.DeleteFunc(s.Reserve, func(id string) bool { return id == "idoru" })
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", SpaceID: "core"})
		if err := GainPawnControl(s, gd, "idoru", "p1"); err != nil {
			t.Fatal(err)
		}
	}
	peers := []domain.Block{}
	for _, b := range gd.Blocks {
		if !b.IsCentralCore && b.ID != "corporate-scandal" {
			peers = append(peers, b)
		}
	}
	cursor := 0
	for i, count := range counts {
		p := s.Players[i]
		for n := CybernetControlMarkerCount(s, p.ID); n < count; n++ {
			if cursor >= len(peers) {
				t.Fatal("not enough physical fixture tiles")
			}
			b := peers[cursor]
			cursor++
			s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: b.ID, Coord: domain.Coord{Q: -cursor}, OwnerID: p.ID})
			s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == b.ID })
		}
		p.ControlMarkersPlaced = count
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "corporate-scandal" })
	s.BlockPile = append(s.BlockPile, "corporate-scandal")
	return f
}
func corporatePrepare(t *testing.T, f malwareFixture) []TransitionResult {
	t.Helper()
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	c := antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "lower-swirl"}}})
	return []TransitionResult{a, b, c}
}
func corporateCapture(t *testing.T, f malwareFixture) TransitionResult {
	return antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
}
func TestCorporateScandalBilingualGeometryPhysicalThresholdsAndSharedByteEvidence(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	b, _ := f.gd.BlockByID("corporate-scandal")
	if b.Name != "Corporate Scandal" || !slices.Equal(b.IceFaces, []int{5, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{false, true, true, false, true, true}) || !slices.Equal(b.NonPlayableZoneIDs, []string{"h1"}) || len(b.Spaces) != 6 || !reflect.DeepEqual(b.Spaces[3].Modifier.Dice, []domain.DefenseDie{{Value: 3, Shielded: true}}) || b.Effects.UnderControl.Kind != "discard-hands-above-markers" || b.Effects.UnderControl.MarkerThreshold != 5 {
		t.Fatal("printed source attributes")
	}
	for _, sp := range b.Spaces {
		if sp.Capacity != 1 {
			t.Fatal("printed single")
		}
	}
	f = corporateFixture(t, []int{5, 6}, true)
	initial := Snapshot(f.s)
	prepared := corporatePrepare(t, f)
	ready := Snapshot(f.s)
	f.s.RNG = domain.NewRNG(5)
	before := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	observer, err := PlayerView(f.s, f.gd, "")
	if err != nil {
		t.Fatal(err)
	}
	captured := corporateCapture(t, f)
	spectator, err := EventsForPlayer(f.s, captured.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"initial": initial, "ready": ready, "before": before, "options": options, "observer": observer, "finished": Snapshot(f.s), "events": [][]EngineEvent{prepared[0].Events, prepared[1].Events, prepared[2].Events, captured.Events}, "spectator": spectator}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "corporate-scandal.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Corporate Scandal shared evidence mismatch", string(raw))
	}
}
func TestCorporateScandalSixthMarkerAllHandsPaymentAndDuplicateConservation(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	cards := sprawlInventory(f.s)
	corporatePrepare(t, f)
	played := slices.Clone(f.s.PlayedCards)
	f.s.RNG = domain.NewRNG(5)
	rng := *f.s.RNG
	if rng.Intn(6)+1 != 6 {
		t.Fatal("source fixture roll")
	}
	r := corporateCapture(t, f)
	after := *f.s.RNG
	if rng.Intn(100000) != after.Intn(100000) || len(f.s.Players[0].Hand) != 0 || len(f.s.Players[1].Hand) != 0 || !slices.Equal(f.s.PlayedCards, append(played, "worm")) || !slices.Equal(f.s.Discard[len(f.s.Discard)-5:], []string{"move-1", "move-1", "move-1", "move-1", "move-2"}) || !slices.Equal(cards, sprawlInventory(f.s)) || f.s.PendingChoice != nil {
		t.Fatal("physical payment/hand conservation")
	}
	pairs := [][2]string{}
	control, discard := -1, -1
	for i, e := range r.Events {
		if e.Type == "card-discarded" {
			pairs = append(pairs, [2]string{e.PlayerID, e.CardID})
		}
		if e.Type == EventControlChanged && control < 0 {
			control = i
		}
		if e.Type == "block-hand-discarded" && discard < 0 {
			discard = i
		}
	}
	if !reflect.DeepEqual(pairs, [][2]string{{"p1", "move-1"}, {"p1", "move-1"}, {"p2", "move-1"}, {"p2", "move-1"}, {"p2", "move-2"}}) || control < 0 || discard <= control {
		t.Fatal("ordered semantic receipts", r.Events)
	}
}
func TestCorporateScandalExclusiveFiveAndPurePreviews(t *testing.T) {
	f := corporateFixture(t, []int{4, 5}, false)
	corporatePrepare(t, f)
	f.s.RNG = domain.NewRNG(5)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	options := AvailableActions(f.s, f.gd)
	if !slices.ContainsFunc(options, func(o AvailableAction) bool { return o.Action.Type == ActPlayIcebreakBlk }) {
		t.Fatal("capture unavailable")
	}
	if _, err := PlayerView(f.s, f.gd, ""); err != nil {
		t.Fatal(err)
	}
	_ = CloneState(f.s)
	after := *f.s.RNG
	if Snapshot(f.s) != before || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("preview mutated state/RNG")
	}
	r := corporateCapture(t, f)
	if len(f.s.Players[0].Hand) != 2 || len(f.s.Players[1].Hand) != 3 || slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == "block-hand-discarded" || e.Type == "card-discarded" }) {
		t.Fatal("exclusive threshold")
	}
}
func TestCorporateScandalIdoruCountsWhilePawnControlAndReserveDoNot(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, true)
	count := 0
	for _, b := range f.s.Cybernet.Blocks {
		if b.OwnerID == "p1" {
			count++
		}
	}
	if count != 4 || CybernetControlMarkerCount(f.s, "p1") != 5 {
		t.Fatal("Idoru precondition")
	}
	corporatePrepare(t, f)
	f.s.RNG = domain.NewRNG(5)
	corporateCapture(t, f)
	if CybernetControlMarkerCount(f.s, "p1") != 6 || len(f.s.Players[0].Hand) != 0 || !reflect.DeepEqual(f.s.ControlCardMarkers, []domain.ControlCardMarker{{PlayerID: "p1", CardID: "idoru-control", Amount: 1}}) {
		t.Fatal("counted physical card marker")
	}
	for _, c := range f.s.ControlCards {
		if c.Subject.ID == f.actor && c.OwnerID != "p1" {
			t.Fatal("ordinary pawn control")
		}
	}
}
func TestCorporateScandalTakeoverReturnsOldMarkerBeforeThreshold(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	corporatePrepare(t, f)
	source := f.s.Cybernet.At(domain.Coord{Q: 1})
	for _, b := range f.s.Cybernet.Blocks {
		if b.OwnerID == "p2" {
			b.OwnerID = ""
			break
		}
	}
	source.OwnerID = "p2"
	f.s.RNG = domain.NewRNG(5)
	corporateCapture(t, f)
	if f.s.Players[0].ControlMarkersPlaced != 6 || f.s.Players[1].ControlMarkersPlaced != 5 || len(f.s.Players[0].Hand) != 0 || len(f.s.Players[1].Hand) != 3 {
		t.Fatal("takeover threshold ordering")
	}
}
func TestCorporateScandalPlacementMissAndRejectedCommandsPreserveHands(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	hand := slices.Clone(f.s.Players[1].Hand)
	corporatePrepare(t, f)
	if !slices.Equal(hand, f.s.Players[1].Hand) {
		t.Fatal("placement discarded hand")
	}
	f.s.RNG = domain.NewRNG(1)
	r := corporateCapture(t, f)
	roll := []int{}
	for _, e := range r.Events {
		if e.Type == EventRoll {
			roll = e.Roll
		}
	}
	if !slices.Equal(roll, []int{2}) || len(f.s.Players[0].Hand) != 2 || len(f.s.Players[1].Hand) != 3 || f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "" {
		t.Fatal("failed capture hand")
	}
	for _, a := range []Action{{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}}, {Type: ActPlayIcebreakBlk, PlayerID: "p2", PawnID: f.actor, CardID: "move-1", Coord: &domain.Coord{Q: 1}}, {Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "move-1", Coord: &domain.Coord{Q: 9, R: 9}}, {Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "move-1", Coord: &domain.Coord{Q: 1}, ExtraRollDice: 1}} {
		restrictionReject(t, f.s, f.gd, a)
	}
}
func TestCorporateScandalQualifyingEmptyHandsAndOtherPlayersWithoutChoice(t *testing.T) {
	f := corporateFixture(t, []int{5, 0, 6}, false)
	corporatePrepare(t, f)
	f.s.Deck = append(f.s.Deck, f.s.Players[2].Hand...)
	f.s.Players[2].Hand = []string{}
	cards := sprawlInventory(f.s)
	f.s.RNG = domain.NewRNG(5)
	r := corporateCapture(t, f)
	ids := []string{}
	publicCards := []EngineEvent{}
	for _, e := range r.Events {
		if e.Type == "block-hand-discarded" {
			ids = append(ids, e.PlayerID)
		}
		if e.Type == "card-discarded" {
			publicCards = append(publicCards, e)
		}
	}
	spectator, err := EventsForPlayer(f.s, r.Events, "")
	if err != nil {
		t.Fatal(err)
	}
	viewCards := []EngineEvent{}
	for _, e := range spectator {
		if e.Type == "card-discarded" {
			viewCards = append(viewCards, e)
		}
	}
	if !slices.Equal(ids, []string{"p1", "p3"}) || len(f.s.Players[0].Hand) != 0 || len(f.s.Players[1].Hand) != 3 || len(f.s.Players[2].Hand) != 0 || f.s.PendingChoice != nil || !slices.Equal(cards, sprawlInventory(f.s)) || !reflect.DeepEqual(publicCards, viewCards) {
		t.Fatal("global empty/public discard")
	}
}
func TestCorporateScandalShieldedSpaceRingAndImmediateVictory(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	corporatePrepare(t, f)
	p := *f.s.Cybernet.PawnByID(f.actor)
	p.SpaceID = "shield"
	defense, err := DefenseProfile(f.s, f.gd, &p)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(defense, domain.DefenseDie{Value: 3, Shielded: true}) {
		t.Fatal("flat defense")
	}
	targets := []string{}
	for _, ref := range StepTargets(f.gd, f.s.Cybernet, p.Coord, "camera", f.actor) {
		if ref.Coord == p.Coord {
			targets = append(targets, ref.SpaceID)
		}
	}
	slices.Sort(targets)
	if !slices.Equal(targets, []string{"helmet", "upper-swirl"}) {
		t.Fatal("phantom center shortcut", targets)
	}
	f.s.Players[0].ControlMarkersTotal = 6
	f.s.RNG = domain.NewRNG(5)
	r := corporateCapture(t, f)
	if f.s.WinnerID != "p1" || len(f.s.Players[0].Hand) != 2 || len(f.s.Players[1].Hand) != 3 || slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == "block-hand-discarded" }) || len(AvailableActions(f.s, f.gd)) != 0 {
		t.Fatal("immediate source victory")
	}
}
func TestCorporateScandalDescriptorValidationAndIsolatedStrictAcceptance(t *testing.T) {
	for _, mutation := range []string{"threshold", "amount", "target", "timing", "misplaced"} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("corporate-scandal")
		e := b.Effects.UnderControl
		switch mutation {
		case "threshold":
			e.MarkerThreshold = 0
		case "amount":
			e.Amount = 1
		case "target":
			e.Target = "p1"
		case "timing":
			b.Effects = domain.BlockEffects{InCybernet: e}
		case "misplaced":
			e.Kind = "controller-core"
		}
		_, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
		if err == nil || !strings.Contains(err.Error(), "marker hand discard") {
			t.Fatal("descriptor gate", mutation, err)
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return !b.IsCentralCore && b.ID != "corporate-scandal" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	gd.Cards = []domain.ActionCard{}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || len(s.Cybernet.Blocks) != 1 {
		t.Fatal("isolated strict", err)
	}
}

func TestCorporateScandalPreservesAttachmentsInvestmentsAndPlayedCards(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, false)
	f.take(t, 1, "dummy")
	copyleftGrant(t, f.s, "p2", 1)
	f.s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.target, SlotRef: "pawn:add-on"})
	f.s.CurrentPlayer = 0
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{}})
	cards := sprawlInventory(f.s)
	corporatePrepare(t, f)
	attachments := slices.Clone(f.s.Cybernet.PawnByID(f.target).Attachments)
	pool, err := BonusCounterPool(f.s)
	if err != nil {
		t.Fatal(err)
	}
	markers := ControlMarkerAllocations(f.s)
	f.s.RNG = domain.NewRNG(5)
	corporateCapture(t, f)
	after, err := BonusCounterPool(f.s)
	if err != nil {
		t.Fatal(err)
	}
	actual := slices.DeleteFunc(ControlMarkerAllocations(f.s), func(m ControlMarkerAllocation) bool { return m.ElementID == "1,0" })
	if !reflect.DeepEqual(attachments, f.s.Cybernet.PawnByID(f.target).Attachments) || !reflect.DeepEqual(pool, after) || !reflect.DeepEqual(markers, actual) || !slices.Equal(f.s.PlayedCards, []string{"move-1", "move-2", "worm"}) || !slices.Equal(cards, sprawlInventory(f.s)) {
		t.Fatal("hand-only cleanup touched other physical zones")
	}
}
func TestCorporateScandalRejectedPostPaymentRollCaptureRestoresStateAndRNG(t *testing.T) {
	f := corporateFixture(t, []int{5, 6}, true)
	corporatePrepare(t, f)
	f.s.RNG = domain.NewRNG(5)
	b, _ := f.gd.BlockByID("corporate-scandal")
	b.Effects.UnderControl.MarkerThreshold = 0
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: &domain.Coord{Q: 1}})
	if !slices.Contains(f.s.Players[0].Hand, "worm") || f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "" {
		t.Fatal("rejected resolution lost payment/control")
	}
}
