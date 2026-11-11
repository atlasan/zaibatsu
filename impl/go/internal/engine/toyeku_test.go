package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func toyekuFixture(t *testing.T) malwareFixture {
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
	for _, id := range []string{"dj", "move-1", "worm"} {
		f.take(t, 0, id)
	}
	f.take(t, 1, "lima-flag")
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "idoru" })
	s.BlockPile = append(s.BlockPile, "idoru")
	return f
}
func toyekuDeclare(t *testing.T, f malwareFixture) TransitionResult {
	t.Helper()
	return useMarkerCommand(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
}
func toyekuPlace(f malwareFixture) TransitionResult {
	return ApplyWithEvents(f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
}
func toyekuPieces(f malwareFixture) []string {
	ids := append([]string{}, f.s.Reserve...)
	ids = append(ids, f.s.Eliminated...)
	ids = append(ids, f.s.OutOfGame...)
	for _, p := range f.s.Cybernet.Pawns {
		ids = append(ids, p.PawnID)
	}
	slices.Sort(ids)
	return ids
}
func toyekuEvidence(t *testing.T, value any) {
	t.Helper()
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "toyeku.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Toyeku shared evidence mismatch", string(raw))
	}
}

func TestToyekuPrintedTopologyAndSymbols(t *testing.T) {
	f := toyekuFixture(t)
	b, _ := f.gd.BlockByID("idoru")
	if b.Provisional || b.BlackIce || !reflect.DeepEqual(b.IceFaces, []int{3, 4, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{false, true, true, false, false, true}) || b.BonusFragments != 3 || !reflect.DeepEqual(b.Edges, []bool{true, true, true, true, true, true}) || !reflect.DeepEqual(b.NonPlayableZoneIDs, []string{"h1"}) {
		t.Fatal(b)
	}
	expected := []struct {
		id, kind  string
		zones     []string
		capacity  domain.ExplicitSpaceCapacity
		neighbors []string
	}{{"upper", "normal", []string{"h2", "h3"}, 2, []string{"left", "defense"}}, {"left", "normal", []string{"h7"}, 1, []string{"upper", "idoru"}}, {"defense", "normal", []string{"h4"}, 1, []string{"upper", "idoru"}}, {"idoru", "pawn", []string{"h5", "h6"}, domain.UnlimitedCapacity, []string{"left", "defense"}}}
	if len(b.Spaces) != 4 {
		t.Fatal(b.Spaces)
	}
	for i, want := range expected {
		sp := b.Spaces[i]
		if sp.ID != want.id || sp.Type != want.kind || sp.Capacity != want.capacity || !reflect.DeepEqual(sp.ZoneIDs, want.zones) || !reflect.DeepEqual(sp.Neighbors, want.neighbors) {
			t.Fatal(sp, want)
		}
	}
	if b.Spaces[2].Modifier.Kind != "defense" || !reflect.DeepEqual(b.Spaces[2].Modifier.Dice, []domain.DefenseDie{{Value: 1, Shielded: false}}) || b.Spaces[3].PawnID != "idoru" || b.Effects.InCybernet.Kind != "place-neutral-pawn" || b.Effects.InCybernet.Target != "idoru" || b.Effects.UnderControl != nil {
		t.Fatal(b)
	}
}
func TestToyekuNeutralPlacementSharedWindowsAndEvents(t *testing.T) {
	f := toyekuFixture(t)
	inventory := toyekuPieces(f)
	before := json.RawMessage(Snapshot(f.s))
	started := toyekuDeclare(t, f)
	pending := json.RawMessage(Snapshot(f.s))
	options := AvailableActions(f.s, f.gd)
	if len(options[0].Responses) != 36 || !slices.Contains(f.s.Reserve, "idoru") {
		t.Fatal(options)
	}
	rng := *f.s.RNG
	ended := toyekuPlace(f)
	if !ended.Accepted {
		t.Fatal(ended)
	}
	pawn := f.s.Cybernet.PawnByID("idoru")
	if pawn == nil || pawn.OwnerID != "" || pawn.Coord != (domain.Coord{Q: 1}) || pawn.SpaceID != "idoru" || slices.Contains(f.s.Reserve, "idoru") || !reflect.DeepEqual(toyekuPieces(f), inventory) {
		t.Fatal("neutral physical placement", pawn)
	}
	for _, card := range f.s.ControlCards {
		if card.Subject.ID == "idoru" && (card.OwnerID != "" || card.Zone != "common") {
			t.Fatal(card)
		}
	}
	for _, p := range f.s.Players {
		if p.ControlMarkersPlaced != 0 {
			t.Fatal("neutral placement spent control marker")
		}
	}
	found := false
	for _, e := range ended.Events {
		if e.Type == EventPawnPlaced {
			found = true
			if e.ToOwnerID != "" || e.ElementID != "idoru" || e.SpaceID != "idoru" || e.Coord == nil || *e.Coord != (domain.Coord{Q: 1}) {
				t.Fatal(e)
			}
		}
	}
	if !found {
		t.Fatal("missing neutral event")
	}
	actual := *f.s.RNG
	if actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("neutral placement consumed RNG")
	}
	tile, _ := f.gd.BlockByID("idoru")
	events := append(started.Events, ended.Events...)
	toyekuEvidence(t, map[string]any{"tile": tile, "before": before, "pending": pending, "options": options, "after": json.RawMessage(Snapshot(f.s)), "observer": mustView(t, f, "p2"), "events": events})
	copy := CloneState(f.s)
	copy.Cybernet.PawnByID("idoru").OwnerID = "p1"
	state := Snapshot(f.s)
	if _, err := ApplyBlockEffectForTrigger(f.s, f.gd, domain.Coord{Q: 1}, BlockEffectInCybernet); err == nil || Snapshot(f.s) != state {
		t.Fatal("repeat placement duplicated/reset a pawn")
	}
}
func TestToyekuBlockControlDoesNotGrantNeutralPawn(t *testing.T) {
	f := toyekuFixture(t)
	toyekuDeclare(t, f)
	if !toyekuPlace(f).Accepted {
		t.Fatal("place")
	}
	for i, entry := range []struct{ id, card string }{{f.actor, "worm"}, {f.target, "lima-flag"}} {
		f.s.CurrentPlayer = i
		p := f.s.Cybernet.PawnByID(entry.id)
		p.Coord = domain.Coord{Q: 1}
		p.SpaceID = "idoru"
		def, _ := f.gd.PawnByID(entry.id)
		def.IcebreakerModifier = &domain.IcebreakerModifier{Faces: []int{1, 2, 3, 4, 5, 6}}
		coord := domain.Coord{Q: 1}
		useMarkerCommand(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: entry.id, CardID: entry.card, Coord: &coord})
		if f.s.Cybernet.PawnByID("idoru").OwnerID != "" {
			t.Fatal("block control acquired neutral pawn")
		}
		for _, c := range f.s.ControlCards {
			if c.Subject.ID == "idoru" && c.Zone != "common" {
				t.Fatal(c)
			}
		}
	}
	if f.s.Players[0].ControlMarkersPlaced != 0 || f.s.Players[1].ControlMarkersPlaced != 1 {
		t.Fatal("marker transfer")
	}
}
func TestToyekuUnavailablePiecesRejectCommittedPlacement(t *testing.T) {
	for _, kind := range []string{"missing-card", "controlled-card", "retained", "excluded", "already-on-board", "missing-space"} {
		f := toyekuFixture(t)
		toyekuDeclare(t, f)
		switch kind {
		case "missing-card":
			f.s.ControlCards = slices.DeleteFunc(f.s.ControlCards, func(c domain.ControlCardState) bool { return c.Subject.ID == "idoru" })
		case "controlled-card":
			for i := range f.s.ControlCards {
				if f.s.ControlCards[i].Subject.ID == "idoru" {
					f.s.ControlCards[i].OwnerID = "p2"
					f.s.ControlCards[i].Zone = "control"
				}
			}
		case "retained":
			f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == "idoru" })
			f.s.Eliminated = append(f.s.Eliminated, "idoru")
		case "excluded":
			f.s.OutOfGame = append(f.s.OutOfGame, "idoru")
		case "already-on-board":
			f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", Coord: domain.Coord{}, SpaceID: "core"})
		case "missing-space":
			b, _ := f.gd.BlockByID("idoru")
			b.Spaces[3].PawnID = ""
		}
		rejectMovement(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
		if f.s.PendingChoice.BlockID != "idoru" || !reflect.DeepEqual(f.s.Discard, []string{"dj"}) || len(f.s.Cybernet.Blocks) != 1 {
			t.Fatal("failed response lost committed draw")
		}
	}
}
func TestToyekuMovementHasNoPhantomTitleSpace(t *testing.T) {
	f := toyekuFixture(t)
	toyekuDeclare(t, f)
	toyekuPlace(f)
	useMarkerCommand(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "idoru"}}})
	same := []string{}
	for _, next := range StepTargets(f.gd, f.s.Cybernet, domain.Coord{Q: 1}, "idoru", f.actor) {
		if next.Coord.Q == 1 {
			same = append(same, next.SpaceID)
		}
	}
	if !reflect.DeepEqual(same, []string{"left", "defense"}) {
		t.Fatal(same)
	}
	rejectMovement(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "worm", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "upper"}}})
	useMarkerCommand(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "worm", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "defense"}}})
	profile, err := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor))
	if err != nil || profile[0].Shielded {
		t.Fatal(profile, err)
	}
}
