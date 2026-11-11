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

func searchChoiceTile() domain.Block {
	return domain.Block{ID: "fixture-search-tile", Name: "Synthetic Search tile", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceHigh, IceFaces: []int{1}, Edges: []bool{true, false, false, false, false, false}, BoundarySpaces: [][]string{{"a"}, {}, {}, {}, {}, {}}, Spaces: []domain.Space{{ID: "a", Type: "special", Capacity: domain.UnlimitedCapacity}}, Provisional: true}
}
func searchChoiceFixture(t *testing.T) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = append(gd.Blocks, searchChoiceTile())
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
	for _, id := range []string{"move-1", "move-1", "dummy"} {
		f.take(t, 0, id)
	}
	at := slices.Index(s.BlockPile, "fixture-search-tile")
	s.BlockPile = append(s.BlockPile[:at], s.BlockPile[at+1:]...)
	s.BlockPile = append(s.BlockPile, "fixture-search-tile")
	return f
}
func sourceSearchBegin(f malwareFixture) TransitionResult {
	return ApplyWithEvents(f.s, f.gd, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"})
}
func sourceSearchResponses(f malwareFixture) []Action {
	return AvailableActions(f.s, f.gd)[0].Responses
}
func searchBlocks(s *domain.GameState) []string {
	out := append([]string{}, s.BlockPile...)
	for _, b := range s.Cybernet.Blocks {
		out = append(out, b.BlockID)
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "place-block" {
		out = append(out, s.PendingChoice.BlockID)
	}
	slices.Sort(out)
	return out
}
func rejectSearch(t *testing.T, f malwareFixture, a Action) TransitionResult {
	t.Helper()
	before := Snapshot(f.s)
	rng := *f.s.RNG
	r := ApplyWithEvents(f.s, f.gd, a)
	actual := *f.s.RNG
	if r.Accepted || Snapshot(f.s) != before || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("Search rejection mutated state/RNG", r)
	}
	return r
}

func TestSourceSearchSharedWindowsAndEvents(t *testing.T) {
	f := searchChoiceFixture(t)
	before := json.RawMessage(Snapshot(f.s))
	inventory := searchBlocks(f.s)
	cards := slotInventory(f.s)
	rng := *f.s.RNG
	r := sourceSearchBegin(f)
	if !r.Accepted {
		t.Fatal(r)
	}
	if !slices.Equal(f.s.Players[0].Hand, []string{"move-1", "dummy"}) || !slices.Equal(f.s.Discard, []string{"move-1"}) || len(f.s.PlayedCards) != 0 || f.s.PendingChoice.BlockID != "fixture-search-tile" || len(f.s.Cybernet.Blocks) != 1 || !slices.Equal(searchBlocks(f.s), inventory) {
		t.Fatal("declaration accounting")
	}
	pendingSnapshot := Snapshot(f.s)
	pending := json.RawMessage(pendingSnapshot)
	options := sourceSearchResponses(f)
	if len(options) != 6 {
		t.Fatal("placements", options)
	}
	placements, err := ValidSearchPlacements(f.s, f.gd, f.actor)
	if err != nil || len(placements) != 6 {
		t.Fatal("placements", placements, err)
	}
	for i, p := range placements {
		want := string(rune('0'+p.Dir)) + ":" + string(rune('0'+p.Rotation))
		if options[i].OptionID != "place:"+want {
			t.Fatal("placement mapping")
		}
	}
	observer := mustView(t, f, "p2")
	if observer.RevealedBlock == nil || observer.RevealedBlock.BlockID != "fixture-search-tile" || observer.RevealedBlock.Reference != (domain.Coord{}) || observer.PendingChoice != nil || len(observer.Options) != 0 {
		t.Fatal("public reveal/authority")
	}
	rejectSearch(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	placed := ApplyWithEvents(f.s, f.gd, options[0])
	if !placed.Accepted || f.s.PendingChoice != nil || f.s.Cybernet.Blocks[len(f.s.Cybernet.Blocks)-1].BlockID != "fixture-search-tile" || !slices.Equal(slotInventory(f.s), cards) || !slices.Equal(searchBlocks(f.s), inventory) || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("placement/accounting", placed)
	}
	value := map[string]any{"before": before, "pending": pending, "pendingSnapshot": pendingSnapshot, "options": options, "observer": observer, "after": json.RawMessage(Snapshot(f.s)), "events": append(r.Events, placed.Events...)}
	b, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(b, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "search-choice.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("source Search shared evidence mismatch", string(b))
	}
}
func TestSourceSearchPureHiddenQueries(t *testing.T) {
	f := searchChoiceFixture(t)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	options := AvailableActions(f.s, f.gd)
	view := mustView(t, f, "p1")
	if _, err := ValidSearchPlacements(f.s, f.gd, f.actor); err == nil {
		t.Fatal("hidden placements exposed")
	}
	if _, err := Search(f.s, f.gd, f.actor, 0, 3); err == nil {
		t.Fatal("source shortcut accepted")
	}
	slices.Reverse(f.s.BlockPile)
	if !reflect.DeepEqual(AvailableActions(f.s, f.gd), options) || !reflect.DeepEqual(mustView(t, f, "p1"), view) {
		t.Fatal("hidden tile permutation leaked")
	}
	slices.Reverse(f.s.BlockPile)
	if Snapshot(f.s) != before || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("query mutation")
	}
	if !sourceSearchBegin(f).Accepted {
		t.Fatal("declaration failed")
	}
	pending := Snapshot(f.s)
	responses := sourceSearchResponses(f)
	if !reflect.DeepEqual(CloneState(f.s).PendingChoice, f.s.PendingChoice) {
		t.Fatal("choice clone")
	}
	responses[0].ChoiceID = "mutated"
	copy := CloneState(f.s)
	copy.PendingChoice.Reference.Q = 99
	if Snapshot(f.s) != pending {
		t.Fatal("choice alias")
	}
}
func TestSourceSearchPendingAuthorityAndAtomicRetry(t *testing.T) {
	f := searchChoiceFixture(t)
	if !sourceSearchBegin(f).Accepted {
		t.Fatal("declaration")
	}
	response := sourceSearchResponses(f)[0]
	cases := []Action{{Type: ActPass}, {Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"}}
	a := response
	a.PlayerID = "p2"
	cases = append(cases, a)
	a = response
	a.ChoiceID = "stale"
	cases = append(cases, a)
	for _, option := range []string{"place:6:0", "place:0:3junk", "discard"} {
		a = response
		a.OptionID = option
		cases = append(cases, a)
	}
	a = response
	a.CardIDs = []string{"dummy"}
	cases = append(cases, a)
	a = response
	a.TargetID = f.target
	cases = append(cases, a)
	a = response
	a.Coord = &domain.Coord{Q: 1}
	cases = append(cases, a)
	for _, a := range cases {
		rejectSearch(t, f, a)
	}
	before := Snapshot(f.s)
	rng := *f.s.RNG
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before || f.s.RNG.Intn(100000) != rng.Intn(100000) {
		t.Fatal("pending phase interleave")
	}
	if !ApplyWithEvents(f.s, f.gd, response).Accepted {
		t.Fatal("legal retry")
	}
	rejectSearch(t, f, response)
}
func TestSourceSearchActivationAndPublicGeometryRejection(t *testing.T) {
	for _, kind := range []string{"no-card", "wrong-owner", "missing-pawn", "no-ability", "empty-pile", "surrounded", "phase", "winner", "free-misuse"} {
		t.Run(kind, func(t *testing.T) {
			f := searchChoiceFixture(t)
			a := Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"}
			switch kind {
			case "no-card":
				a.CardID = "not-in-hand"
			case "wrong-owner":
				a.PawnID = f.target
			case "missing-pawn":
				a.PawnID = "missing"
			case "no-ability":
				p, _ := f.gd.PawnByID(f.actor)
				p.Abilities = nil
			case "empty-pile":
				f.s.BlockPile = nil
			case "surrounded":
				for dir := 0; dir < 6; dir++ {
					f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "data-haven", Coord: (domain.Coord{}).Neighbor(dir)})
				}
			case "phase":
				f.s.Phase = domain.PhaseBeginning
			case "winner":
				f.s.WinnerID = "p1"
			case "free-misuse":
				a.Type = ActSearch
			}
			rejectSearch(t, f, a)
			if kind != "no-card" && kind != "free-misuse" {
				for _, o := range AvailableActions(f.s, f.gd) {
					if o.Action.Type == ActPlaySearch && o.Action.PawnID == a.PawnID {
						t.Fatal("illegal Search option")
					}
				}
			}
		})
	}
}
func TestSourceSearchFreeUseCommitAndReset(t *testing.T) {
	f := searchChoiceFixture(t)
	pawn, _ := f.gd.PawnByID(f.actor)
	for i := range pawn.Abilities {
		if pawn.Abilities[i].Ability == "search" {
			pawn.Abilities[i].Activation = "once-per-turn"
		}
	}
	rejectSearch(t, f, Action{Type: ActPlaySearch, PawnID: f.actor})
	rejectSearch(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"})
	hand := append([]string{}, f.s.Players[0].Hand...)
	r := ApplyWithEvents(f.s, f.gd, Action{Type: ActSearch, PawnID: f.actor})
	if !r.Accepted || !(nativeUseCount(f.s, f.actor, "search") > 0) || !slices.Equal(f.s.Players[0].Hand, hand) || len(f.s.Discard) != 0 {
		t.Fatal("free commit", r)
	}
	if !ApplyWithEvents(f.s, f.gd, sourceSearchResponses(f)[0]).Accepted {
		t.Fatal("free place")
	}
	rejectSearch(t, f, Action{Type: ActSearch, PawnID: f.actor})
	for i := 0; i < 8; i++ {
		if !AdvancePhase(f.s, f.gd).Accepted {
			t.Fatal("phase reset", i)
		}
	}
	if f.s.CurrentPlayer != 0 || f.s.Phase != domain.PhaseAction || len(UseMarkerAllocations(f.s)) != 0 || !ApplyWithEvents(f.s, f.gd, Action{Type: ActSearch, PawnID: f.actor}).Accepted {
		t.Fatal("next-turn free reset")
	}
}
func TestSourceSearchRepeatedPhysicalDuplicateCosts(t *testing.T) {
	f := searchChoiceFixture(t)
	f.s.BlockPile = slices.DeleteFunc(f.s.BlockPile, func(id string) bool { return id == "engineering-war" || id == "fixture-search-tile" })
	f.s.BlockPile = append(f.s.BlockPile, "engineering-war", "fixture-search-tile")
	inventory := searchBlocks(f.s)
	cards := slotInventory(f.s)
	previous := ""
	for i := 0; i < 2; i++ {
		if !sourceSearchBegin(f).Accepted || f.s.PendingChoice.ID == previous {
			t.Fatal("repeat declaration")
		}
		previous = f.s.PendingChoice.ID
		if !ApplyWithEvents(f.s, f.gd, sourceSearchResponses(f)[0]).Accepted {
			t.Fatal("repeat placement")
		}
	}
	if !slices.Equal(f.s.Discard, []string{"move-1", "move-1"}) || !slices.Equal(f.s.Players[0].Hand, []string{"dummy"}) || f.s.Cybernet.Pawns[0].Coord != (domain.Coord{}) || !slices.Equal(searchBlocks(f.s), inventory) || !slices.Equal(slotInventory(f.s), cards) {
		t.Fatal("repeat physical accounting")
	}
}
func TestSourceSearchBonusAndThreatTiming(t *testing.T) {
	f := searchChoiceFixture(t)
	core, _ := f.gd.CentralCore()
	core.BonusCorners = []bool{true, true, true, true, true, true}
	newTile := &f.gd.Blocks[len(f.gd.Blocks)-1]
	newTile.BonusCorners = []bool{true, true, true, true, true, true}
	newTile.Effects.InCybernet = &domain.BlockEffect{Kind: "area-attack", Amount: 1}
	newTile.Spaces[0].Type = "event"
	peer := *core
	peer.ID = "fixture-peer"
	peer.Name = "Synthetic bonus peer"
	peer.IsCentralCore = false
	f.gd.Blocks = append(f.gd.Blocks, peer)
	f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "fixture-peer", Coord: domain.Coord{Q: 1, R: -1}})
	f.gd.Threats = []domain.Threat{{ID: "fixture-guard", Name: "Synthetic guard", Type: "drone", AttackDie: 4, Defense: []domain.DefenseDie{{Value: 1}}}}
	f.s.ThreatPile = []string{"fixture-guard"}
	if !sourceSearchBegin(f).Accepted || len(f.s.Cybernet.BonusIcons) != 0 || len(f.s.Threats) != 0 {
		t.Fatal("premature placement effects")
	}
	var option Action
	for _, a := range sourceSearchResponses(f) {
		if a.OptionID == "place:0:3" {
			option = a
		}
	}
	r := ApplyWithEvents(f.s, f.gd, option)
	bonusEvent := false
	for _, e := range r.Events {
		bonusEvent = bonusEvent || e.Type == EventBonusIconCreated
	}
	if !r.Accepted || len(f.s.Cybernet.BonusIcons) != 1 || !bonusEvent || len(f.s.Threats) != 1 || len(f.s.ThreatPile) != 0 {
		t.Fatal("placement timing", r)
	}
	types := []EventType{}
	for _, e := range r.Events {
		types = append(types, e.Type)
	}
	if !slices.Equal(types, []EventType{EventChoiceResolved, EventBlockPlaced, EventBonusIconCreated, EventBonusCounterPlaced, EventRoll}) {
		t.Fatal("placement event order", types)
	}
}
func TestSourceSearchUnsupportedDefinitionKeepsPendingTile(t *testing.T) {
	f := searchChoiceFixture(t)
	tile := &f.gd.Blocks[len(f.gd.Blocks)-1]
	tile.Edges = []bool{false, false, false, false, false, false}
	rejectSearch(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "move-1"})
	tile.Edges = []bool{true, false, false, false, false, false}
	tile.Effects.InCybernet = &domain.BlockEffect{Kind: "custom", Text: "Unimplemented fixture"}
	if !sourceSearchBegin(f).Accepted {
		t.Fatal("reveal unsupported effect")
	}
	response := sourceSearchResponses(f)[0]
	if !strings.Contains(rejectSearch(t, f, response).Error, "unsupported") || !slices.Equal(f.s.Discard, []string{"move-1"}) || f.s.PendingChoice.BlockID != "fixture-search-tile" {
		t.Fatal("unsupported tile lost")
	}
	_, err := NewGame(Config{Data: f.gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err == nil || !strings.Contains(err.Error(), "unsupported block placement") {
		t.Fatal("unsupported official block effect accepted", err)
	}
	tile.Effects.InCybernet = nil
	if !ApplyWithEvents(f.s, f.gd, response).Accepted {
		t.Fatal("fixed data retry")
	}
}

func TestSourceSearchOccupiedAndPostRollRollback(t *testing.T) {
	f := searchChoiceFixture(t)
	f.s.Cybernet.Blocks = append(f.s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "data-haven", Coord: domain.Coord{Q: 1}})
	if !sourceSearchBegin(f).Accepted {
		t.Fatal("declaration")
	}
	for _, a := range sourceSearchResponses(f) {
		if a.OptionID == "place:0:3" {
			t.Fatal("occupied placement offered")
		}
	}
	rejectSearch(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:3"})
	g := searchChoiceFixture(t)
	tile := &g.gd.Blocks[len(g.gd.Blocks)-1]
	tile.Effects.InCybernet = &domain.BlockEffect{Kind: "area-attack", Amount: 1}
	tile.Spaces[0].Type = "event"
	g.s.ThreatPile = []string{"missing-threat"}
	if !sourceSearchBegin(g).Accepted {
		t.Fatal("roll declaration")
	}
	response := sourceSearchResponses(g)[0]
	rng := *g.s.RNG
	if !strings.Contains(rejectSearch(t, g, response).Error, "sourced combat data") || len(g.s.Cybernet.Blocks) != 1 || !slices.Equal(g.s.ThreatPile, []string{"missing-threat"}) || !slices.Equal(g.s.Discard, []string{"move-1"}) {
		t.Fatal("post-roll rollback")
	}
	g.gd.Threats = []domain.Threat{{ID: "missing-threat", Name: "Synthetic fixed guard", Type: "drone", AttackDie: 4, Defense: []domain.DefenseDie{{Value: 1}}}}
	accepted := ApplyWithEvents(g.s, g.gd, response)
	if !accepted.Accepted {
		t.Fatal(accepted)
	}
	die := rng.Intn(6) + 1
	found := false
	for _, e := range accepted.Events {
		if e.Type == EventRoll {
			found = slices.Equal(e.Roll, []int{die})
		}
	}
	actual := *g.s.RNG
	if !found || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("effect roll journal/RNG")
	}
}
