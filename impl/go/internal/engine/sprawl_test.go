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

func sprawlFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "move-1", "octagon-dex"} {
		f.take(t, 0, id)
	}
	f.take(t, 1, "dummy")
	f.take(t, 1, "worm")
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "idoru" || id == "chiba-city" })
	s.BlockPile = append(s.BlockPile, "chiba-city")
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "idoru", Coord: domain.Coord{R: 1}})
	s.Reserve = slices.DeleteFunc(s.Reserve, func(id string) bool { return id == "idoru" })
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", Coord: domain.Coord{R: 1}, SpaceID: "idoru"})
	if err := GainPawnControl(s, gd, "idoru", "p1"); err != nil {
		t.Fatal(err)
	}
	s.Cybernet.RemovePawn(f.target)
	s.Eliminated = append(s.Eliminated, f.target)
	return f
}
func sprawlStart(t *testing.T, f malwareFixture) (TransitionResult, json.RawMessage, TransitionResult) {
	t.Helper()
	first := ApplyWithEvents(f.s, f.gd, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	if !first.Accepted {
		t.Fatal(first)
	}
	revealed := json.RawMessage(Snapshot(f.s))
	placed := ApplyWithEvents(f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	if !placed.Accepted {
		t.Fatal(placed)
	}
	return first, revealed, placed
}
func sprawlInventory(s *domain.GameState) []string {
	cards := append([]string{}, s.Deck...)
	cards = append(cards, s.Discard...)
	cards = append(cards, s.PlayedCards...)
	for _, p := range s.Players {
		cards = append(cards, p.Hand...)
	}
	for _, p := range s.Cybernet.Pawns {
		for _, a := range p.Attachments {
			cards = append(cards, a.CardID)
		}
	}
	for _, b := range s.Cybernet.Blocks {
		for _, a := range b.Attachments {
			cards = append(cards, a.CardID)
		}
	}
	slices.Sort(cards)
	return cards
}
func sprawlResponse(f malwareFixture, id string, cards ...string) Action {
	for _, d := range f.s.PendingBlockDiscards.Decisions {
		if d.PlayerID == id {
			return Action{Type: ActResolveChoice, PlayerID: id, ChoiceID: d.ID, OptionID: "discard", CardIDs: cards}
		}
	}
	return Action{}
}

func TestSprawlGeometryAndSharedCommitmentEvidence(t *testing.T) {
	f := sprawlFixture(t)
	hack, _ := f.gd.BlockByID("hacktivism")
	sprawl, _ := f.gd.BlockByID("chiba-city")
	if !reflect.DeepEqual(hack.IceFaces, []int{2, 5, 6}) || !reflect.DeepEqual(hack.BonusCorners, []bool{false, true, true, true, true, true}) || !reflect.DeepEqual(hack.BoundarySpaces, [][]string{{"upper"}, {"right"}, {"lower"}, {"mask"}, {"shield"}, {"shield"}}) || !reflect.DeepEqual(hack.Spaces[0].Modifier.Dice, []domain.DefenseDie{{Value: 2, Shielded: true}, {Value: 3, Shielded: true}}) || !reflect.DeepEqual(sprawl.IceFaces, []int{2, 4, 6}) || !reflect.DeepEqual(sprawl.BonusCorners, []bool{true, true, true, false, false, true}) || !reflect.DeepEqual(sprawl.BoundarySpaces, [][]string{{"shield"}, {"right"}, {"city"}, {"city"}, {"left"}, {"rabbit"}}) || sprawl.Effects.UnderControl != nil {
		t.Fatal("bilingual printed fields")
	}
	if ControlledPawnCount(f.s, "p1") != 2 || ControlledPawnCount(f.s, "p2") != 1 {
		t.Fatal("controlled/retained counts")
	}
	initial := json.RawMessage(Snapshot(f.s))
	declared, revealed, placed := sprawlStart(t, f)
	pending := json.RawMessage(Snapshot(f.s))
	options := [][]AvailableAction{AvailableActions(f.s, f.gd, "p1"), AvailableActions(f.s, f.gd, "p2")}
	first := ApplyWithEvents(f.s, f.gd, sprawlResponse(f, "p2", "worm"))
	if !first.Accepted {
		t.Fatal(first)
	}
	committed := json.RawMessage(Snapshot(f.s))
	observer, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	spectator, err := PlayerView(f.s, f.gd, "")
	if err != nil {
		t.Fatal(err)
	}
	last := ApplyWithEvents(f.s, f.gd, sprawlResponse(f, "p1", "move-1", "move-1"))
	if !last.Accepted {
		t.Fatal(last)
	}
	tiles := []any{}
	for _, b := range f.gd.Blocks {
		if b.ID == "hacktivism" || b.ID == "chiba-city" {
			if len(b.Spaces) != 5 || !b.Provisional || !reflect.DeepEqual(b.Edges, []bool{true, true, true, true, true, true}) || !reflect.DeepEqual(b.NonPlayableZoneIDs, []string{"h1"}) {
				t.Fatal(b)
			}
			tiles = append(tiles, map[string]any{"id": b.ID, "iceFaces": b.IceFaces, "bonusCorners": b.BonusCorners, "bonusFragments": b.BonusFragments, "spaceArrows": b.SpaceArrows, "nonPlayableZoneIds": b.NonPlayableZoneIDs, "spaces": b.Spaces})
		}
	}
	value := map[string]any{"tiles": tiles, "initial": initial, "revealed": revealed, "pending": pending, "options": options, "committed": committed, "observer": observer, "spectator": spectator, "finished": json.RawMessage(Snapshot(f.s)), "events": [][]EngineEvent{declared.Events, placed.Events, first.Events, last.Events}}
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "sprawl.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Sprawl shared evidence mismatch", string(raw))
	}
}

func TestSprawlPrivateOffTurnCommitmentsAndStableOrder(t *testing.T) {
	a, b := sprawlFixture(t), sprawlFixture(t)
	physicalCards := sprawlInventory(a.s)
	sprawlStart(t, a)
	sprawlStart(t, b)
	before := Snapshot(a.s)
	rng := *a.s.RNG
	view, err := PlayerView(a.s, a.gd, "p2")
	if err != nil || view.PendingChoice == nil || view.PendingChoice.PlayerID != "p2" || len(AvailableActions(a.s, a.gd, "p2")) != 1 || Snapshot(a.s) != before {
		t.Fatal("own decision query", err)
	}
	checkRNG := *a.s.RNG
	expectedRNG := rng
	if checkRNG.Intn(10000) != expectedRNG.Intn(10000) {
		t.Fatal("query RNG")
	}
	first := ApplyWithEvents(a.s, a.gd, sprawlResponse(a, "p2", "worm"))
	if !first.Accepted || !reflect.DeepEqual(a.s.Players[1].Hand, []string{"dummy", "worm"}) || !reflect.DeepEqual(a.s.Discard, []string{"dj"}) {
		t.Fatal(first)
	}
	for _, e := range first.Events {
		if e.Type == "card-discarded" {
			t.Fatal("early reveal")
		}
	}
	v, _ := PlayerView(a.s, a.gd, "p1")
	raw, _ := json.Marshal(v)
	if strings.Contains(string(raw), "worm") {
		t.Fatal("leaked selection")
	}
	v2, _ := PlayerView(a.s, a.gd, "p2")
	if len(v2.Options) != 0 {
		t.Fatal("submitted player still has choices")
	}
	clone := CloneState(a.s)
	clone.PendingBlockDiscards.Decisions[1].CardIDs[0] = "dummy"
	if a.s.PendingBlockDiscards.Decisions[1].CardIDs[0] != "worm" {
		t.Fatal("clone alias")
	}
	for _, step := range []struct {
		f     malwareFixture
		id    string
		cards []string
	}{{a, "p1", []string{"move-1", "move-1"}}, {b, "p1", []string{"move-1", "move-1"}}, {b, "p2", []string{"worm"}}} {
		if r := ApplyWithEvents(step.f.s, step.f.gd, sprawlResponse(step.f, step.id, step.cards...)); !r.Accepted {
			t.Fatal(r)
		}
	}
	if Snapshot(a.s) != Snapshot(b.s) || !reflect.DeepEqual(a.s.Discard, []string{"dj", "move-1", "move-1", "worm"}) || a.s.PendingChoice != nil || a.s.PendingBlockDiscards != nil {
		t.Fatal("commit order changed final state")
	}
	if !reflect.DeepEqual(sprawlInventory(a.s), physicalCards) || len(AvailableActions(a.s, a.gd, "p2")) != 0 {
		t.Fatal("physical cards lost or off-turn ordinary options exposed")
	}
	checkRNG = *a.s.RNG
	if checkRNG.Intn(10000) != rng.Intn(10000) {
		t.Fatal("commit RNG")
	}
}

func TestSprawlRejectionsPreserveCommittedPlacementAndRNG(t *testing.T) {
	f := sprawlFixture(t)
	sprawlStart(t, f)
	own, other := sprawlResponse(f, "p1", "move-1", "move-1"), sprawlResponse(f, "p2", "worm")
	wrong := other
	wrong.PlayerID = "p1"
	few := own
	few.CardIDs = []string{"move-1"}
	many := own
	many.CardIDs = []string{"move-1", "move-1", "move-1"}
	unavailable := own
	unavailable.CardIDs = []string{"dummy", "dummy"}
	extra := own
	extra.CardID = "dj"
	for _, a := range []Action{wrong, few, many, unavailable, extra, {Type: ActPass}} {
		cardMarkerReject(t, f, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted {
		t.Fatal("phase interleaved")
	}
	if r := ApplyWithEvents(f.s, f.gd, other); !r.Accepted {
		t.Fatal(r)
	}
	cardMarkerReject(t, f, other)
	if !reflect.DeepEqual(f.s.Discard, []string{"dj"}) {
		t.Fatal("early discard")
	}
}

func TestSprawlShortfallAndHacktivismDoNotSilentlySkipRules(t *testing.T) {
	for _, id := range []string{"chiba-city", "hacktivism"} {
		f := sprawlFixture(t)
		if id == "chiba-city" {
			f.s.Deck = append(f.s.Deck, f.s.Players[1].Hand...)
			f.s.Players[1].Hand = nil
		} else {
			f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(b string) bool { return b == id })
			f.s.BlockPile = append(f.s.BlockPile, id)
		}
		if r := ApplyWithEvents(f.s, f.gd, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"}); !r.Accepted {
			t.Fatal(r)
		}
		cardMarkerReject(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
		if f.s.PendingChoice.BlockID != id || !reflect.DeepEqual(f.s.Discard, []string{"dj"}) {
			t.Fatal("lost committed Search")
		}
	}
}

func TestInternalArrowsDirectionsRotationsExceptionsAndCleanup(t *testing.T) {
	f := sprawlFixture(t)
	f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(b string) bool { return b == "chiba-city" })
	f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "chiba-city", Coord: domain.Coord{Q: 1}, Rotation: 3})
	actor := f.s.Cybernet.PawnByID(f.actor)
	actor.Coord = domain.Coord{Q: 1}
	actor.SpaceID = "rabbit"
	if r := ApplyWithEvents(f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: actor.Coord, SpaceID: "shield"}}}); !r.Accepted {
		t.Fatal(r)
	}
	has := func(id string) bool {
		for _, p := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1}, "shield", f.actor) {
			if p.SpaceID == id {
				return true
			}
		}
		return false
	}
	if !has("core") {
		t.Fatal("internal arrow removed a legal rotated cross-edge exit")
	}
	if has("rabbit") || !has("right") {
		t.Fatal("directed link")
	}
	profile, err := DefenseProfile(f.s, f.gd, actor)
	if err != nil || !profile[2].Shielded {
		t.Fatal(profile, err)
	}
	cardMarkerReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: actor.Coord, SpaceID: "rabbit"}}})
	if r := ApplyWithEvents(f.s, f.gd, Action{Type: ActAttachPawn, CardID: "octagon-dex", TargetID: f.actor}); !r.Accepted || !has("rabbit") {
		t.Fatal(r)
	}
	events := []EngineEvent{}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor), 0, &events)
	if has("rabbit") {
		t.Fatal("removed exception retained")
	}
	block, _ := f.gd.BlockByID("chiba-city")
	for _, arrows := range [][]domain.SpaceArrow{{{From: "missing", To: "shield"}}, {{From: "rabbit", To: "city"}}, {{From: "rabbit", To: "shield"}, {From: "shield", To: "rabbit"}}} {
		block.SpaceArrows = arrows
		if err := ValidateSpaceArrows(block); err == nil {
			t.Fatal("invalid arrows accepted")
		}
		if _, err := NewGame(Config{Data: f.gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
			t.Fatal("constructor accepted arrows")
		}
	}
}
