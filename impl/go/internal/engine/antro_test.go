package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func antroFixture(t *testing.T, equip bool) malwareFixture {
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
	for _, id := range []string{"weapon-gunhed", "ak-12km", "phase-loop", "dj", "move-2", "move-1", "move-2", "move-3", "worm"} {
		f.take(t, 0, id)
	}
	f.take(t, 1, "dummy")
	s.Players[0].BonusCounters = 6
	s.Players[1].BonusCounters = 2
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "weapon-gunhed", TargetID: f.actor})
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "ak-12km", TargetID: f.actor})
	if equip {
		antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "phase-loop", TargetID: f.actor})
	}
	s.CurrentPlayer = 1
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "dummy", TargetID: f.target})
	s.CurrentPlayer = 0
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "antro" })
	s.BlockPile = append(s.BlockPile, "antro")
	return f
}
func antroAccept(t *testing.T, f malwareFixture, a Action) TransitionResult {
	t.Helper()
	r := ApplyWithEvents(f.s, f.gd, a)
	if !r.Accepted {
		t.Fatal(r)
	}
	return r
}
func antroStart(t *testing.T, f malwareFixture) [][]EngineEvent {
	a := antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	b := antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	return [][]EngineEvent{a.Events, b.Events}
}
func antroMove(t *testing.T, f malwareFixture, space string) TransitionResult {
	return antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "dance"}, {Coord: domain.Coord{Q: 1}, SpaceID: space}}})
}
func antroResponses(t *testing.T, f malwareFixture) []Action {
	t.Helper()
	r, err := SpaceEffectResponses(f.s, f.gd)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func antroReject(t *testing.T, f malwareFixture, a Action) {
	t.Helper()
	before := Snapshot(f.s)
	rng := *f.s.RNG
	if r := ApplyWithEvents(f.s, f.gd, a); r.Accepted {
		t.Fatal("accepted", a)
	}
	check := *f.s.RNG
	if Snapshot(f.s) != before || check.Intn(10000) != rng.Intn(10000) {
		t.Fatal("rejected command changed state/RNG")
	}
}

func TestAntroGeometryChoicesAndSharedEvidence(t *testing.T) {
	f := antroFixture(t, true)
	b, _ := f.gd.BlockByID("antro")
	if !reflect.DeepEqual(b.IceFaces, []int{3, 5, 6}) || !reflect.DeepEqual(b.BonusCorners, []bool{false, false, true, false, true, true}) || len(b.Spaces) != 4 || b.Spaces[0].Capacity != 2 || b.Spaces[3].Capacity != 2 || b.Spaces[1].Effect.CardType != "add-on" || b.Spaces[2].Effect.CardType != "gadget" || !reflect.DeepEqual(b.Spaces[0].Modifier.Dice, []domain.DefenseDie{{Value: 3, Shielded: true}, {Value: 4, Shielded: true}, {Value: 5, Shielded: true}}) {
		t.Fatal("printed geometry")
	}
	cards := sprawlInventory(f.s)
	initial := json.RawMessage(Snapshot(f.s))
	events := antroStart(t, f)
	events = append(events, antroMove(t, f, "add-on").Events)
	pending := json.RawMessage(Snapshot(f.s))
	options := antroResponses(t, f)
	rng := *f.s.RNG
	before := Snapshot(f.s)
	if len(options) != 3 || options[0].OptionID != "skip" || options[1].TargetID != f.actor || options[2].TargetID != f.target || len(AvailableActions(f.s, f.gd, "p2")) != 0 || Snapshot(f.s) != before {
		t.Fatal("authorized physical options")
	}
	check := *f.s.RNG
	if check.Intn(10000) != rng.Intn(10000) {
		t.Fatal("query rng")
	}
	events = append(events, antroAccept(t, f, options[1]).Events)
	p := f.s.Cybernet.PawnByID(f.actor)
	_, hand := PlayerAttachmentModifiers(f.s, f.gd, "p1")
	if len(p.Attachments) != 1 || p.Attachments[0].CardID != "phase-loop" || f.s.Players[0].BonusCounters != 5 || hand != -2 || !reflect.DeepEqual(cards, sprawlInventory(f.s)) {
		t.Fatal("provider cascade/refund/conservation")
	}
	antroSharedJSON(t, "antro.json", map[string]any{"initial": initial, "pending": pending, "options": options, "finished": json.RawMessage(Snapshot(f.s)), "events": events})
}
func TestAntroAuthorizationPhysicalIdentityAndInterleaving(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	antroMove(t, f, "add-on")
	a := antroResponses(t, f)[1]
	bad := []Action{}
	b := a
	b.PlayerID = "p2"
	bad = append(bad, b)
	b = a
	b.ChoiceID = "old"
	bad = append(bad, b)
	b = a
	b.AttachmentID = "absent"
	bad = append(bad, b)
	b = a
	b.TargetID = f.target
	bad = append(bad, b)
	b = a
	b.AttachmentID = f.s.Cybernet.PawnByID(f.actor).Attachments[1].InstanceID
	bad = append(bad, b)
	b = a
	b.CardID = "worm"
	bad = append(bad, b)
	b = antroResponses(t, f)[0]
	b.TargetID = f.actor
	bad = append(bad, b, Action{Type: ActPass})
	for _, a := range bad {
		antroReject(t, f, a)
	}
	before := Snapshot(f.s)
	if AdvancePhase(f.s, f.gd).Accepted || Snapshot(f.s) != before {
		t.Fatal("phase interleaving")
	}
	antroAccept(t, f, antroResponses(t, f)[2])
	if len(f.s.Cybernet.PawnByID(f.target).Attachments) != 0 || f.s.Players[1].BonusCounters != 2 {
		t.Fatal("opponent refund")
	}
}
func TestAntroGadgetRemovalSkipAndStopTiming(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	antroMove(t, f, "gadget")
	options := antroResponses(t, f)
	if len(options) != 2 {
		t.Fatal(options)
	}
	antroAccept(t, f, options[1])
	_, hand := PlayerAttachmentModifiers(f.s, f.gd, "p1")
	m := EffectiveIcebreakerModifier(f.gd, f.s.Cybernet.PawnByID(f.actor))
	if f.s.Players[0].BonusCounters != 3 || hand != 0 || m.RollDice != 0 || m.IgnoresBlackIce || !reflect.DeepEqual(m.Faces, []int{4}) {
		t.Fatal("gadget cleanup")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-1"})
	if f.s.PendingChoice != nil {
		t.Fatal("zero step retrigger")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "upper"}, {Coord: domain.Coord{Q: 1}, SpaceID: "gadget"}}})
	if len(antroResponses(t, f)) != 1 {
		t.Fatal("empty family still offers skip")
	}
	antroAccept(t, f, antroResponses(t, f)[0])
	pass := antroFixture(t, true)
	antroStart(t, pass)
	antroAccept(t, pass, Action{Type: ActPlayMove, PawnID: pass.actor, CardID: "move-3", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "dance"}, {Coord: domain.Coord{Q: 1}, SpaceID: "add-on"}, {Coord: domain.Coord{Q: 1}, SpaceID: "upper"}}})
	if pass.s.PendingChoice != nil {
		t.Fatal("pass-through triggered")
	}
}
func TestAntroMalformedIdentityRollbackAndStrictOfficialRejection(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	f.s.Cybernet.PawnByID(f.actor).Attachments[0].InstanceID = ""
	antroReject(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "dance"}, {Coord: domain.Coord{Q: 1}, SpaceID: "add-on"}}})
	antro, _ := f.gd.BlockByID("antro")
	if err := ValidateSpaceEffects(antro, true); err == nil {
		t.Fatal("strict effect-space loading")
	}
}
func TestPhaseLoopPrintedAttributesAndBothActingRoutes(t *testing.T) {
	for _, route := range []string{"block", "pawn"} {
		f := antroFixture(t, true)
		card := cardByID(f.gd, "phase-loop")
		m := card.Attach.IcebreakerModifier
		if card.Type != "gadget" || card.Copies != 1 || card.Movement != 2 || !slices.Contains(card.Class, "cyberdeck") || card.Attach.Cost != 1 || card.Attach.HandModifier != -2 || m.RollDice != 1 || !m.IgnoresBlackIce || len(card.Attach.Grants) != 0 {
			t.Fatal("printed fields")
		}
		antroStart(t, f)
		actor, target := f.s.Cybernet.PawnByID(f.actor), f.s.Cybernet.PawnByID(f.target)
		actor.Coord = domain.Coord{Q: 1}
		actor.SpaceID = "dance"
		target.Coord = actor.Coord
		target.SpaceID = "upper"
		def, _ := f.gd.PawnByID(f.target)
		def.IceFaces = []int{3, 5, 6}
		def.IceValue = domain.IceHigh
		f.s.RNG = domain.NewRNG(79)
		var r IcebreakResult
		var err error
		if route == "block" {
			r, err = IcebreakBlock(f.s, f.gd, f.actor, actor.Coord, 0)
		} else {
			r, err = IcebreakPawn(f.s, f.gd, f.actor, f.target, 0)
		}
		if err != nil || !r.Success || !reflect.DeepEqual(r.Roll, []int{1, 5}) {
			t.Fatal(route, r, err)
		}
	}
}
func TestPhaseLoopBlackIceProtectionAndRemoval(t *testing.T) {
	for _, route := range []string{"block", "pawn"} {
		f := antroFixture(t, true)
		antroStart(t, f)
		actor, target := f.s.Cybernet.PawnByID(f.actor), f.s.Cybernet.PawnByID(f.target)
		actor.Coord = domain.Coord{Q: 1}
		actor.SpaceID = "dance"
		target.Coord = actor.Coord
		target.SpaceID = "upper"
		def, _ := f.gd.PawnByID(f.actor)
		def.IcebreakerModifier = nil
		b, _ := f.gd.BlockByID("antro")
		b.IceFaces = []int{6}
		b.IceValue = domain.IceBlack
		p, _ := f.gd.PawnByID(f.target)
		p.IceFaces = []int{6}
		p.IceValue = domain.IceBlack
		roll := func() IcebreakResult {
			t.Helper()
			var r IcebreakResult
			var err error
			if route == "block" {
				r, err = IcebreakBlock(f.s, f.gd, f.actor, actor.Coord, 0)
			} else {
				r, err = IcebreakPawn(f.s, f.gd, f.actor, f.target, 0)
			}
			if err != nil {
				t.Fatal(err)
			}
			return r
		}
		f.s.RNG = domain.NewRNG(1)
		r := roll()
		if r.Success || r.AttackerEliminated || !reflect.DeepEqual(r.Roll, []int{2, 2}) {
			t.Fatal(r)
		}
		DiscardPawnAttachment(f.s, f.gd, actor, 2, nil)
		f.s.RNG = domain.NewRNG(1)
		r = roll()
		if r.Success || !r.AttackerEliminated || !reflect.DeepEqual(r.Roll, []int{2}) {
			t.Fatal(r)
		}
	}
	f := antroFixture(t, true)
	if _, err := IcebreakBlock(f.s, f.gd, f.actor, domain.Coord{}, 0); err == nil {
		t.Fatal("actor created target ICE")
	}
}

func antroSharedJSON(t *testing.T, name string, value any) {
	t.Helper()
	raw, _ := json.Marshal(value)
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, name)), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("shared evidence mismatch", string(raw))
	}
}

func TestAntroCommittedMovementRollAndSecondChoice(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	p, _ := f.gd.PawnByID(f.actor)
	p.Movement = domain.Movement{Type: "d6", Activation: "once-per-turn"}
	f.s.RNG = domain.NewRNG(1)
	antroAccept(t, f, Action{Type: ActRollMovement, PawnID: f.actor})
	if !reflect.DeepEqual(f.s.PendingChoice.Movement.Roll, []int{2}) {
		t.Fatal("committed roll")
	}
	rng := *f.s.RNG
	antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "move", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "dance"}, {Coord: domain.Coord{Q: 1}, SpaceID: "add-on"}}})
	if f.s.PendingChoice.Kind != "space-discard" {
		t.Fatal("second decision")
	}
	a := antroResponses(t, f)[1]
	a.AttachmentID = "stale"
	antroReject(t, f, a)
	antroAccept(t, f, antroResponses(t, f)[0])
	for _, a := range AvailableActions(f.s, f.gd) {
		if a.Action.Type == ActRollMovement {
			t.Fatal("refreshed use")
		}
	}
	check := *f.s.RNG
	if check.Intn(10000) != rng.Intn(10000) {
		t.Fatal("reroll")
	}
}
func TestAntroRelocationPhasePauseAndUndefinedPolicy(t *testing.T) {
	for _, explicit := range []bool{false, true} {
		f := antroFixture(t, true)
		antroStart(t, f)
		f.take(t, 0, "jetpack")
		antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "jetpack", TargetID: f.actor})
		if explicit {
			cardByID(f.gd, "jetpack").Attach.PhaseEffects[0].ThreatMode = "normal-movement"
		}
		f.s.Phase = domain.PhaseBeginning
		if r := AdvancePhase(f.s, f.gd); !r.Accepted {
			t.Fatal(r)
		}
		coord := domain.Coord{Q: 1}
		a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "relocate", Coord: &coord, SpaceID: "add-on"}
		if !explicit {
			for _, target := range AvailableActions(f.s, f.gd)[0].Targets {
				if target.SpaceID == "add-on" {
					t.Fatal("unresolved destination offered")
				}
			}
			antroReject(t, f, a)
			continue
		}
		antroAccept(t, f, a)
		if f.s.PendingPhase != string(domain.PhaseBeginning) || f.s.PendingChoice.Kind != "space-discard" {
			t.Fatal("phase completed too early")
		}
		antroAccept(t, f, antroResponses(t, f)[0])
		if f.s.PendingPhase != "" || f.s.Phase != domain.PhaseAction {
			t.Fatal("phase did not resume")
		}
	}
}
func TestPhaseLoopSeparateActionStrip(t *testing.T) {
	f := antroFixture(t, false)
	antroStart(t, f)
	actor := f.s.Cybernet.PawnByID(f.actor)
	actor.Coord = domain.Coord{Q: 1}
	actor.SpaceID = "dance"
	b, _ := f.gd.BlockByID("antro")
	b.IceFaces = []int{1, 2, 3, 4, 5, 6}
	r := antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "phase-loop", Coord: &actor.Coord})
	for _, e := range r.Events {
		if e.Type == "roll" && len(e.Roll) != 1 {
			t.Fatal("attachment die used from hand")
		}
	}
	_, hand := PlayerAttachmentModifiers(f.s, f.gd, "p1")
	if !slices.Contains(f.s.PlayedCards, "phase-loop") || f.s.Players[0].BonusCounters != 3 || hand != 0 || EffectiveIcebreakerModifier(f.gd, actor).RollDice != 0 {
		t.Fatal("strip incorrectly attached")
	}
}

func TestAntroHexStoppingAndThreatOverlapRollback(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	b, _ := f.gd.BlockByID("antro")
	b.Spaces[0], b.Spaces[1] = b.Spaces[1], b.Spaces[0] // Synthetic landing order, not a sourced hex-destination ruling.
	p, _ := f.gd.PawnByID(f.actor)
	p.Movement = domain.Movement{Type: "hex", Activation: "once-per-turn"}
	antroAccept(t, f, Action{Type: ActMoveHex, PawnID: f.actor})
	if f.s.PendingChoice.SpaceID != "add-on" {
		t.Fatal("hex stop")
	}
	copy := CloneState(f.s)
	copy.PendingChoice.Reference.Q = 99
	copy.PendingChoice.SpaceID = "elsewhere"
	if f.s.PendingChoice.Reference.Q != 1 {
		t.Fatal("shared choice clone")
	}
	antroAccept(t, f, antroResponses(t, f)[0])
	g := antroFixture(t, true)
	antroStart(t, g)
	actor := g.s.Cybernet.PawnByID(g.actor)
	actor.Coord = domain.Coord{Q: 1}
	actor.SpaceID = "dance"
	g.s.Threats = []domain.ThreatOnBoard{{ID: "test-threat", ThreatID: "synthetic", Coord: domain.Coord{Q: 1}, SpaceID: "upper", Status: "inactive"}}
	antroReject(t, g, Action{Type: ActPlayMove, PawnID: g.actor, CardID: "move-1", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "add-on"}}})
	if g.s.PendingThreats != nil || g.s.Threats[0].Status != "inactive" {
		t.Fatal("threat overlap escaped rollback")
	}
}
func TestAntroLegacyAddonFamilyAndOpponentGadget(t *testing.T) {
	f := antroFixture(t, true)
	antroStart(t, f)
	f.take(t, 0, "octagon-dex")
	antroAccept(t, f, Action{Type: ActAttachPawn, CardID: "octagon-dex", TargetID: f.actor})
	antroMove(t, f, "add-on")
	pawn := f.s.Cybernet.PawnByID(f.actor)
	ref := pawn.Attachments[len(pawn.Attachments)-1].InstanceID
	for _, a := range antroResponses(t, f) {
		if a.AttachmentID == ref {
			antroAccept(t, f, a)
		}
	}
	if len(f.s.Cybernet.PawnByID(f.actor).Attachments) != 3 {
		t.Fatal("slot-only Add-on family")
	}
	g := antroFixture(t, false)
	at := slices.Index(g.s.Players[0].Hand, "phase-loop")
	g.s.Players[0].Hand = slices.Delete(g.s.Players[0].Hand, at, at+1)
	g.s.Players[1].Hand = append(g.s.Players[1].Hand, "phase-loop")
	g.s.CurrentPlayer = 1
	antroAccept(t, g, Action{Type: ActAttachPawn, CardID: "phase-loop", TargetID: g.target})
	g.s.CurrentPlayer = 0
	antroStart(t, g)
	antroMove(t, g, "gadget")
	antroAccept(t, g, antroResponses(t, g)[1])
	if len(g.s.Cybernet.PawnByID(g.target).Attachments) != 1 || g.s.Players[1].BonusCounters != 1 {
		t.Fatal("opponent Gadget/refund")
	}
}
func TestPhaseLoopInvalidActingModifiersAndNoGrantedActivation(t *testing.T) {
	for _, m := range []*domain.IcebreakerModifier{{RollDice: -1}, {Faces: []int{7}}, {Faces: []int{1, 1}}} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		cardByID(gd, "phase-loop").Attach.IcebreakerModifier = m
		if _, err = NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
			t.Fatal("malformed acting modifier accepted")
		}
	}
	f := antroFixture(t, true)
	p, _ := f.gd.PawnByID(f.actor)
	p.Abilities = nil
	if _, err := IcebreakBlock(f.s, f.gd, f.actor, domain.Coord{}, 0); err == nil {
		t.Fatal("Gadget granted activation")
	}
}
