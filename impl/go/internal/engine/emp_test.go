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

func empFixture(t *testing.T, prevention bool, playerCounts ...int) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	worker := gd.Pawns[0]
	worker.ID = "fixture-worker"
	worker.Name = "Synthetic non-Reboot worker"
	worker.IsStarter = false
	worker.Abilities = []domain.Ability{}
	worker.Provisional = true
	gd.Pawns = append(gd.Pawns, worker)
	gd.ControlCards = append(gd.ControlCards, domain.ControlCard{ID: "fixture-worker-control", Name: worker.Name, Expansion: domain.ExpSpeedrunners, Subject: domain.CardSubject{Kind: "pawn", ID: worker.ID}, Provisional: true})
	names := []string{"A", "B"}
	if len(playerCounts) > 0 && playerCounts[0] == 4 {
		names = append(names, "C", "D")
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
	for _, id := range []string{"dj", "weapon-gunhed", "ak-12km", "phase-loop"} {
		f.take(t, 0, id)
	}
	attachment := "jetpack"
	if prevention {
		attachment = "dummy"
	}
	f.take(t, 1, attachment)
	s.Players[0].BonusCounters = 6
	s.Players[1].BonusCounters = 2
	for _, pair := range [][2]string{{"idoru", "p1"}, {worker.ID, "p2"}} {
		s.Reserve = slices.DeleteFunc(s.Reserve, func(id string) bool { return id == pair[0] })
		s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: pair[0], Coord: domain.Coord{}, SpaceID: "core"})
		if err := GainPawnControl(s, gd, pair[0], pair[1]); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"weapon-gunhed", "ak-12km", "phase-loop"} {
		antroAccept(t, f, Action{Type: ActAttachPawn, CardID: id, TargetID: f.actor})
	}
	s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: attachment, TargetID: worker.ID})
	s.CurrentPlayer = 0
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "electromagnetic-pulse" })
	s.BlockPile = append(s.BlockPile, "electromagnetic-pulse")
	return f
}
func empStart(t *testing.T, f malwareFixture) (TransitionResult, json.RawMessage, TransitionResult) {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	revealed := json.RawMessage(Snapshot(f.s))
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	return a, revealed, b
}
func empResponse(f malwareFixture, playerID, targetID string) Action {
	for _, d := range f.s.PendingBlockSacrifices.Decisions {
		if d.PlayerID == playerID {
			return Action{Type: ActResolveChoice, PlayerID: playerID, ChoiceID: d.ID, OptionID: "sacrifice", TargetID: targetID}
		}
	}
	return Action{}
}
func empPieces(f malwareFixture) []string {
	out := append([]string{}, f.s.Reserve...)
	out = append(out, f.s.OutOfGame...)
	out = append(out, f.s.Eliminated...)
	for _, p := range f.s.Cybernet.Pawns {
		out = append(out, p.PawnID)
	}
	slices.Sort(out)
	return out
}

func TestEMPGeometryAndSharedSacrificeEvidence(t *testing.T) {
	f := empFixture(t, false)
	b, _ := f.gd.BlockByID("electromagnetic-pulse")
	if !reflect.DeepEqual(b.IceFaces, []int{4, 5, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{true, true, true, true, false, true}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"danger"}, {"atom"}, {"defense"}, {"globe"}, {"circuit"}, {"mask"}}) || len(b.Spaces) != 6 || b.Effects.InCybernet.MinimumControlledPawns != 2 || b.Effects.InCybernet.Amount != 1 {
		t.Fatal("printed geometry/effect")
	}
	for _, sp := range b.Spaces {
		if sp.Capacity != 1 {
			t.Fatal("single spaces")
		}
	}
	if !reflect.DeepEqual(b.Space("defense").Modifier.Dice, []domain.DefenseDie{{Value: 2, Shielded: false}}) || !reflect.DeepEqual(b.SpaceArrows, []domain.SpaceArrow{{From: "danger", To: "mask"}}) {
		t.Fatal("square defense and arrow")
	}
	initial := json.RawMessage(Snapshot(f.s))
	drawn, revealed, placed := empStart(t, f)
	pending := json.RawMessage(Snapshot(f.s))
	options := [][]AvailableAction{AvailableActions(f.s, f.gd, "p1"), AvailableActions(f.s, f.gd, "p2")}
	first := antroAccept(t, f, empResponse(f, "p2", "fixture-worker"))
	committed := json.RawMessage(Snapshot(f.s))
	observer, err := PlayerView(f.s, f.gd, "p1")
	if err != nil {
		t.Fatal(err)
	}
	spectator, err := PlayerView(f.s, f.gd, "")
	if err != nil {
		t.Fatal(err)
	}
	last := antroAccept(t, f, empResponse(f, "p1", f.actor))
	antroSharedJSON(t, "emp.json", map[string]any{"initial": initial, "revealed": revealed, "pending": pending, "options": options, "committed": committed, "observer": observer, "spectator": spectator, "finished": json.RawMessage(Snapshot(f.s)), "events": [][]EngineEvent{drawn.Events, placed.Events, first.Events, last.Events}})
}
func TestEMPOwnerCommitmentsStableEliminationRefundsAndConservation(t *testing.T) {
	a, b := empFixture(t, false), empFixture(t, false)
	cards, physical := sprawlInventory(a.s), empPieces(a)
	empStart(t, a)
	empStart(t, b)
	before := Snapshot(a.s)
	rng := *a.s.RNG
	options := AvailableActions(a.s, a.gd, "p2")
	view, err := PlayerView(a.s, a.gd, "p2")
	if err != nil || len(options) != 1 || len(options[0].Responses) != 2 || view.PendingChoice.PlayerID != "p2" || Snapshot(a.s) != before {
		t.Fatal("own pure query", err)
	}
	first := antroAccept(t, a, empResponse(a, "p2", "fixture-worker"))
	for _, e := range first.Events {
		if e.Type == EventElimination {
			t.Fatal("early elimination")
		}
	}
	if a.s.Cybernet.PawnByID("fixture-worker") == nil || a.s.Players[1].BonusCounters != 1 || len(AvailableActions(a.s, a.gd, "p2")) != 0 {
		t.Fatal("deferred resolution")
	}
	spectator, err := PlayerView(a.s, a.gd, "")
	if err != nil || spectator.BlockSacrifices.Decisions[1].PawnID != "fixture-worker" {
		t.Fatal("public selection", err)
	}
	copy := CloneState(a.s)
	copy.PendingBlockSacrifices.Decisions[0].CandidatePawnIDs[0] = "changed"
	if Snapshot(copy) == Snapshot(a.s) {
		t.Fatal("clone alias")
	}
	antroAccept(t, a, empResponse(a, "p1", a.actor))
	antroAccept(t, b, empResponse(b, "p1", b.actor))
	antroAccept(t, b, empResponse(b, "p2", "fixture-worker"))
	if Snapshot(a.s) != Snapshot(b.s) || !slices.Contains(a.s.Eliminated, a.actor) || !slices.Contains(a.s.Reserve, "fixture-worker") || a.s.Players[0].BonusCounters != 6 || a.s.Players[1].BonusCounters != 2 || a.s.PendingBlockSacrifices != nil || !reflect.DeepEqual(cards, sprawlInventory(a.s)) || !reflect.DeepEqual(physical, empPieces(a)) {
		t.Fatal("resolution/refunds/conservation")
	}
	for _, card := range a.s.ControlCards {
		if card.Subject.ID == a.actor && card.Zone != "control" || card.Subject.ID == "fixture-worker" && card.Zone != "common" {
			t.Fatal("zone cleanup")
		}
	}
	check := *a.s.RNG
	if check.Intn(100000) != rng.Intn(100000) {
		t.Fatal("query/choices consumed RNG")
	}
}
func TestEMPAuthorityInvalidSelectionsAndAtomicRevalidation(t *testing.T) {
	f := empFixture(t, false)
	empStart(t, f)
	a := empResponse(f, "p2", "fixture-worker")
	bad := []Action{}
	b := a
	b.PlayerID = "p1"
	bad = append(bad, b)
	b = a
	b.ChoiceID = "old"
	bad = append(bad, b)
	b = a
	b.TargetID = f.actor
	bad = append(bad, b)
	b = a
	b.TargetID = "unknown"
	bad = append(bad, b)
	b = a
	b.OptionID = "skip"
	bad = append(bad, b)
	b = a
	b.CardID = "dj"
	bad = append(bad, b)
	b = a
	b.AttachmentID = "attachment-1"
	bad = append(bad, b)
	b = a
	b.TargetIDs = []string{f.target}
	bad = append(bad, b, Action{Type: ActPass})
	for _, a := range bad {
		antroReject(t, f, a)
	}
	before := Snapshot(f.s)
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase interleaving")
	}
	antroAccept(t, f, a)
	antroReject(t, f, a)
	SetPawnControl(f.s, "fixture-worker", "p1")
	last := empResponse(f, "p1", f.actor)
	antroReject(t, f, last)
	r := ApplyWithEvents(f.s, f.gd, last)
	if !strings.Contains(r.Error, "committed sacrifice pawn") || f.s.Cybernet.PawnByID(f.actor) == nil || f.s.Players[0].BonusCounters != 2 {
		t.Fatal("batch revalidation before cleanup", r)
	}
}
func TestEMPThresholdRetainedControlAndNoAffectedPlayers(t *testing.T) {
	f := empFixture(t, false)
	eliminatePawn(f.s, f.target, f.gd)
	if ControlledPawnCount(f.s, "p2") != 2 {
		t.Fatal("retained count")
	}
	empStart(t, f)
	if !reflect.DeepEqual(f.s.PendingBlockSacrifices.Decisions[1].CandidatePawnIDs, []string{"fixture-worker"}) {
		t.Fatal("retained target eligibility")
	}
	antroReject(t, f, empResponse(f, "p2", f.target))
	g := empFixture(t, false)
	b, _ := g.gd.BlockByID("electromagnetic-pulse")
	b.Effects.InCybernet.MinimumControlledPawns = 3
	empStart(t, g)
	if g.s.PendingChoice != nil || g.s.PendingBlockSacrifices != nil || len(g.s.Cybernet.Pawns) != 4 {
		t.Fatal("data-owned threshold")
	}
}
func TestEMPRetainedOnlySearchRollbackAndExplicitPreventionGap(t *testing.T) {
	f := empFixture(t, false)
	p, _ := f.gd.PawnByID("fixture-worker")
	p.Abilities = []domain.Ability{{Ability: "reboot", Activation: "card"}}
	eliminatePawn(f.s, f.target, f.gd)
	eliminatePawn(f.s, "fixture-worker", f.gd)
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"}
	antroReject(t, f, a)
	r := ApplyWithEvents(f.s, f.gd, a)
	if !strings.Contains(r.Error, "retained pawn") || !slices.Contains(f.s.Discard, "dj") {
		t.Fatal("paid Search preservation", r)
	}
	g := empFixture(t, true)
	empStart(t, g)
	options := AvailableActions(g.s, g.gd, "p2")[0]
	if len(options.Responses) != 1 || options.Responses[0].TargetID != g.target || len(options.UnresolvedTargets) != 1 || options.UnresolvedTargets[0].PawnID != "fixture-worker" {
		t.Fatal("executable versus unresolved targets", options)
	}
	antroReject(t, g, empResponse(g, "p2", "fixture-worker"))
	antroAccept(t, g, empResponse(g, "p2", g.target))
	antroAccept(t, g, empResponse(g, "p1", "idoru"))
	if g.s.Cybernet.PawnByID("fixture-worker").Attachments[0].CardID != "dummy" {
		t.Fatal("unselected prevention consumed")
	}
}

func TestEMPMalformedDescriptorsAndOfficialPolicyGate(t *testing.T) {
	for _, effect := range []*domain.BlockEffect{{Kind: "sacrifice-per-player", Amount: 2, MinimumControlledPawns: 2}, {Kind: "sacrifice-per-player", Amount: 1, MinimumControlledPawns: 0}, {Kind: "sacrifice-per-player", Amount: 1, MinimumControlledPawns: 2, Target: "p1"}} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("electromagnetic-pulse")
		b.Effects.InCybernet = effect
		if _, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "sacrifice descriptor") {
			t.Fatal("malformed effect", err)
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return b.ID != "central-core" && b.ID != "electromagnetic-pulse" })
	for i := range gd.Blocks {
		gd.Blocks[i].Provisional = false
	}
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.Cards = nil
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "global sacrifice ordering") {
		t.Fatal("strict effect gate", err)
	}
}

func TestEMPFourPlayerThresholdLeavesUnaffectedOwnersUntouched(t *testing.T) {
	f := empFixture(t, false, 4)
	unaffected := []domain.PawnOnBoard{}
	for _, p := range f.s.Cybernet.Pawns {
		if p.OwnerID == "p3" || p.OwnerID == "p4" {
			unaffected = append(unaffected, *p)
		}
	}
	empStart(t, f)
	if len(f.s.PendingBlockSacrifices.Decisions) != 2 {
		t.Fatal("unaffected owner given decision")
	}
	for _, id := range []string{"p3", "p4"} {
		v, err := PlayerView(f.s, f.gd, id)
		if err != nil || len(AvailableActions(f.s, f.gd, id)) != 0 || v.PendingChoice != nil {
			t.Fatal("unaffected owner options", err)
		}
	}
	antroAccept(t, f, empResponse(f, "p1", f.actor))
	antroAccept(t, f, empResponse(f, "p2", "fixture-worker"))
	after := []domain.PawnOnBoard{}
	for _, p := range f.s.Cybernet.Pawns {
		if p.OwnerID == "p3" || p.OwnerID == "p4" {
			after = append(after, *p)
		}
	}
	if !reflect.DeepEqual(unaffected, after) {
		t.Fatal("single-pawn controller changed")
	}
}
