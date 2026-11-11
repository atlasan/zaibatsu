package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func movementChoiceBoard(id string) domain.Block {
	return domain.Block{ID: id, Name: "Synthetic movement board", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceHigh, IceFaces: []int{1}, Edges: []bool{true, true, true, true, true, true}, BoundarySpaces: [][]string{{"a"}, {"a"}, {"a"}, {"a"}, {"a"}, {"a"}}, Spaces: []domain.Space{{ID: "a", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"b"}}, {ID: "b", Type: "normal", Neighbors: []string{"a", "c"}}, {ID: "c", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"b"}}}, Provisional: true}
}
func movementRef(spaceID string, q ...int) SpaceRef {
	coord := domain.Coord{Q: 1}
	if len(q) > 0 {
		coord.Q = q[0]
	}
	return SpaceRef{Coord: coord, SpaceID: spaceID}
}
func movementChoiceFixture(t *testing.T, kind ...string) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = append(gd.Blocks, movementChoiceBoard("fixture-movement-board"), movementChoiceBoard("fixture-movement-next"))
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
	movementType := "2d6"
	if len(kind) > 0 {
		movementType = kind[0]
	}
	pawn, _ := gd.PawnByID(f.actor)
	pawn.Movement = domain.Movement{Type: movementType, Activation: "once-per-turn"}
	for i, p := range s.Cybernet.Pawns {
		p.Coord = domain.Coord{Q: 1}
		p.SpaceID = "a"
		if i > 0 {
			p.SpaceID = "b"
		}
	}
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "fixture-movement-board", Coord: domain.Coord{Q: 1}}, &domain.PlacedBlock{BlockID: "fixture-movement-next", Coord: domain.Coord{Q: 2}})
	kept := []string{}
	for _, id := range s.BlockPile {
		if id != "fixture-movement-board" && id != "fixture-movement-next" {
			kept = append(kept, id)
		}
	}
	s.BlockPile = kept
	return f
}
func movementBegin(f malwareFixture, extra ...Action) TransitionResult {
	a := Action{Type: ActRollMovement, PawnID: f.actor}
	if len(extra) > 0 {
		a.MovementIndex = extra[0].MovementIndex
		a.CardID = extra[0].CardID
	}
	return ApplyWithEvents(f.s, f.gd, a)
}
func movementFinish(f malwareFixture, path ...SpaceRef) TransitionResult {
	return ApplyWithEvents(f.s, f.gd, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "move", Path: path})
}
func mustMovementPreview(t *testing.T, f malwareFixture, path ...SpaceRef) MovementChoiceProjection {
	t.Helper()
	p, err := MovementChoicePreview(f.s, f.gd, path)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func rejectMovement(t *testing.T, f malwareFixture, a Action) TransitionResult {
	t.Helper()
	before := Snapshot(f.s)
	rng := *f.s.RNG
	r := ApplyWithEvents(f.s, f.gd, a)
	actual := *f.s.RNG
	if r.Accepted || Snapshot(f.s) != before || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("movement rejection mutated state/RNG", r)
	}
	return r
}
func movementEvidence(t *testing.T, key string, value any) {
	t.Helper()
	var all map[string]any
	_ = json.Unmarshal([]byte(readGolden(t, "movement-choice.json")), &all)
	b, _ := json.Marshal(value)
	var got any
	_ = json.Unmarshal(b, &got)
	if !reflect.DeepEqual(got, all[key]) {
		t.Fatal("movement shared evidence mismatch", key, string(b))
	}
}

func TestRolledMovementSharedWindowsAndEvents(t *testing.T) {
	f := movementChoiceFixture(t)
	before := json.RawMessage(Snapshot(f.s))
	rng := *f.s.RNG
	cards := slotInventory(f.s)
	expected := []int{rng.Intn(6) + 1, rng.Intn(6) + 1}
	started := movementBegin(f)
	if !started.Accepted || !slices.Equal(f.s.PendingChoice.Movement.Roll, expected) || !(nativeUseCount(f.s, f.actor, "move") > 0) || f.s.Cybernet.PawnByID(f.actor).SpaceID != "a" {
		t.Fatal("movement commit", started)
	}
	pendingSnapshot := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	observer := mustView(t, f, "p2")
	if observer.Movement == nil || !slices.Equal(observer.Movement.Roll, expected) || len(observer.Options) != 0 || observer.PendingChoice != nil {
		t.Fatal("public dice/authority")
	}
	occupied := mustMovementPreview(t, f, movementRef("b"))
	hasC := false
	for _, n := range occupied.NextTargets {
		hasC = hasC || n.SpaceID == "c"
	}
	if occupied.CanFinish || !hasC || Snapshot(f.s) != pendingSnapshot {
		t.Fatal("occupied pass-through preview")
	}
	ended := movementFinish(f, movementRef("b"), movementRef("c"))
	actual := *f.s.RNG
	if !ended.Accepted || f.s.PendingChoice != nil || !slices.Equal(slotInventory(f.s), cards) || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("movement completion", ended)
	}
	movementEvidence(t, "native", map[string]any{"before": before, "pending": json.RawMessage(pendingSnapshot), "pendingSnapshot": pendingSnapshot, "options": options, "observer": observer, "occupied": occupied, "after": json.RawMessage(Snapshot(f.s)), "events": append(started.Events, ended.Events...)})
}
func TestRolledMovementAtomicRetriesAndPurePreview(t *testing.T) {
	f := movementChoiceFixture(t)
	if !movementBegin(f).Accepted {
		t.Fatal("roll")
	}
	id := f.s.PendingChoice.ID
	budget := f.s.PendingChoice.Movement.Budget
	before := Snapshot(f.s)
	rng := *f.s.RNG
	response := Action{Type: ActResolveChoice, ChoiceID: id, OptionID: "move", Path: []SpaceRef{movementRef("b"), movementRef("c")}}
	cases := []Action{{Type: ActPass}, {Type: ActRollMovement, PawnID: f.actor}}
	a := response
	a.PlayerID = "p2"
	cases = append(cases, a)
	a = response
	a.ChoiceID = "stale"
	cases = append(cases, a)
	a = response
	a.OptionID = "discard"
	cases = append(cases, a)
	a = response
	a.CardID = "dummy"
	cases = append(cases, a)
	a = response
	a.PawnID = f.target
	cases = append(cases, a)
	for _, path := range [][]SpaceRef{{movementRef("b")}, {movementRef("missing")}, func() []SpaceRef {
		out := []SpaceRef{}
		for i := 0; i < budget+1; i++ {
			out = append(out, movementRef("b"))
		}
		return out
	}()} {
		a = response
		a.Path = path
		cases = append(cases, a)
	}
	for _, a := range cases {
		rejectMovement(t, f, a)
	}
	if AdvancePhase(f.s, f.gd).Accepted {
		t.Fatal("phase skip")
	}
	preview := mustMovementPreview(t, f)
	preview.Roll[0] = 99
	preview.NextTargets[0].Coord.Q = 99
	copy := CloneState(f.s)
	copy.PendingChoice.Movement.Origin.Coord.Q = 99
	actual := *f.s.RNG
	if Snapshot(f.s) != before || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("preview aliases state/RNG")
	}
	if !movementFinish(f, movementRef("b"), movementRef("c")).Accepted {
		t.Fatal("legal retry")
	}
	rejectMovement(t, f, response)
}
func TestRolledMovementRejectBeforeCommit(t *testing.T) {
	for _, kind := range []string{"path-first", "wrong-owner", "card-on-free", "fixed", "phase", "winner", "missing", "index"} {
		t.Run(kind, func(t *testing.T) {
			f := movementChoiceFixture(t)
			a := Action{Type: ActRollMovement, PawnID: f.actor}
			switch kind {
			case "path-first":
				a.Path = []SpaceRef{movementRef("b"), movementRef("c")}
			case "wrong-owner":
				a.PawnID = f.target
			case "card-on-free":
				a.CardID = "dummy"
			case "fixed":
				p, _ := f.gd.PawnByID(f.actor)
				p.Movement = domain.Movement{Type: "steps", Steps: 3, Activation: "once-per-turn"}
			case "phase":
				f.s.Phase = domain.PhaseBeginning
			case "winner":
				f.s.WinnerID = "p1"
			case "missing":
				a.PawnID = "missing"
			case "index":
				a.MovementIndex = 99
			}
			rejectMovement(t, f, a)
		})
	}
	f := movementChoiceFixture(t)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, Path: []SpaceRef{movementRef("b"), movementRef("c")}})
	if _, err := MoveStepsWithOption(f.s, f.gd, f.actor, []SpaceRef{movementRef("b"), movementRef("c")}, 0); err == nil {
		t.Fatal("path-first helper accepted")
	}
	actual := *f.s.RNG
	if Snapshot(f.s) != before || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("path-first RNG")
	}
}
func TestRolledMovementOneDieZeroBudgetAndStop(t *testing.T) {
	f := movementChoiceFixture(t, "d6")
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-negative", Name: "Synthetic modifier", Attach: &domain.Attach{As: "pawn", Slot: "armor", MovementModifier: -99}})
	f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-negative", Slot: "armor", SlotRef: "pawn:armor"}}
	rng := *f.s.RNG
	die := rng.Intn(6) + 1
	if !movementBegin(f).Accepted || !slices.Equal(f.s.PendingChoice.Movement.Roll, []int{die}) || f.s.PendingChoice.Movement.Budget != 0 {
		t.Fatal("zero budget roll")
	}
	options := AvailableActions(f.s, f.gd)
	if len(mustMovementPreview(t, f).NextTargets) != 0 || !movementFinish(f).Accepted || f.s.Cybernet.PawnByID(f.actor).SpaceID != "a" || !(nativeUseCount(f.s, f.actor, "move") > 0) {
		t.Fatal("zero-step stop")
	}
	actual := *f.s.RNG
	if actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("stop rerolled")
	}
	movementEvidence(t, "zeroOptions", options)
	g := movementChoiceFixture(t, "d6")
	g.gd.Cards = append(g.gd.Cards, domain.ActionCard{ID: "fixture-positive", Name: "Synthetic positive modifier", Attach: &domain.Attach{As: "pawn", Slot: "armor", MovementModifier: 1}})
	g.s.Cybernet.PawnByID(g.actor).Attachments = []domain.Attachment{{CardID: "fixture-positive", Slot: "armor", SlotRef: "pawn:armor"}}
	expectedRNG := *g.s.RNG
	expected := expectedRNG.Intn(6) + 2
	if !movementBegin(g).Accepted || g.s.PendingChoice.Movement.Budget != expected {
		t.Fatal("positive modifier")
	}
	path := []SpaceRef{}
	for i := 0; i < expected+1; i++ {
		space := "b"
		if i%2 > 0 {
			space = "a"
		}
		path = append(path, movementRef(space))
	}
	rejectMovement(t, g, Action{Type: ActResolveChoice, ChoiceID: g.s.PendingChoice.ID, OptionID: "move", Path: path})
	if !movementFinish(g, movementRef("b"), movementRef("c")).Accepted {
		t.Fatal("modifier applied twice")
	}

}
func TestRolledMovementPaidGrantAndIndependentCardMoves(t *testing.T) {
	f := movementChoiceFixture(t)
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-dice-grant", Name: "Synthetic paid dice grant", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "2d6"}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "card"}}}})
	f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-dice-grant", Slot: "gadget", SlotRef: "pawn:gadget"}}
	cards := slotInventory(f.s)
	for i := 0; i < 2; i++ {
		if !movementBegin(f, Action{MovementIndex: 1, CardID: "move-1"}).Accepted || len(f.s.PlayedCards) != i+1 || len(f.s.Discard) != 0 || !movementFinish(f).Accepted {
			t.Fatal("paid grant physical cost")
		}
	}
	if !slices.Equal(f.s.Players[0].Hand, []string{"dummy"}) || len(UseMarkerAllocations(f.s)) != 0 || !slices.Equal(slotInventory(f.s), cards) {
		t.Fatal("paid grant accounting")
	}
	native := false
	for _, o := range AvailableActions(f.s, f.gd) {
		native = native || o.Action.Type == ActRollMovement && o.Action.MovementIndex == 0
	}
	if !native || !movementBegin(f).Accepted || !movementFinish(f, movementRef("b"), movementRef("c")).Accepted {
		t.Fatal("native independent movement")
	}
	paid := false
	for _, o := range AvailableActions(f.s, f.gd) {
		paid = paid || o.Action.Type == ActPlayMove && o.Action.CardID == "dummy"
	}
	r := ApplyWithEvents(f.s, f.gd, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "dummy", Path: []SpaceRef{movementRef("b"), movementRef("a")}})
	if !paid || !r.Accepted || !(nativeUseCount(f.s, f.actor, "move") > 0) {
		t.Fatal("independent card movement", r)
	}
}
func TestRolledMovementGrantedFreeRoutesReset(t *testing.T) {
	f := movementChoiceFixture(t)
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-free-die", Name: "Synthetic free die grant", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "d6"}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "once-per-turn", PerTurn: 1}}}})
	f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-free-die", Slot: "gadget", SlotRef: "pawn:gadget"}}
	if !movementBegin(f, Action{MovementIndex: 1}).Accepted || !movementFinish(f).Accepted {
		t.Fatal("granted free roll")
	}
	rejectMovement(t, f, Action{Type: ActRollMovement, PawnID: f.actor, MovementIndex: 1})
	if !movementBegin(f).Accepted || !movementFinish(f).Accepted {
		t.Fatal("cumulative native route")
	}
	for i := 0; i < 8; i++ {
		if !AdvancePhase(f.s, f.gd).Accepted {
			t.Fatal("next-turn reset")
		}
	}
	if len(UseMarkerAllocations(f.s)) != 0 || !movementBegin(f, Action{MovementIndex: 1}).Accepted {
		t.Fatal("granted reset")
	}
}
func TestRolledMovementRestrictionsAndCancellation(t *testing.T) {
	f := movementChoiceFixture(t)
	at := slices.Index(f.s.Deck, "lima-flag")
	f.s.Deck = append(f.s.Deck[:at], f.s.Deck[at+1:]...)
	f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "lima-flag", Slot: "add-on", SlotRef: "pawn:add-on"}}
	if !movementBegin(f).Accepted {
		t.Fatal("restricted roll")
	}
	for _, target := range mustMovementPreview(t, f).NextTargets {
		if target.Coord.Q == 0 {
			t.Fatal("Core entry offered")
		}
	}
	rejectMovement(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "move", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "core"}}})
	if !movementFinish(f, movementRef("b"), movementRef("c")).Accepted {
		t.Fatal("legal restricted move")
	}

	for _, exception := range []bool{false, true} {
		g := movementChoiceFixture(t)
		block, _ := g.gd.BlockByID("fixture-movement-board")
		direction := 3
		block.Spaces[0].Direction = &direction
		if exception {
			at := slices.Index(g.s.Deck, "octagon-dex")
			g.s.Deck = append(g.s.Deck[:at], g.s.Deck[at+1:]...)
			slot := cardByID(g.gd, "octagon-dex").Attach.Slot
			g.s.Cybernet.PawnByID(g.actor).Attachments = []domain.Attachment{{CardID: "octagon-dex", Slot: slot, SlotRef: "pawn:" + slot}}
		}
		if !movementBegin(g).Accepted {
			t.Fatal("arrow roll")
		}
		offered := false
		for _, target := range mustMovementPreview(t, g).NextTargets {
			offered = offered || target.Coord.Q == 2
		}
		if offered != exception {
			t.Fatal("arrow exception")
		}
		if exception {
			if !movementFinish(g, movementRef("a", 2)).Accepted {
				t.Fatal("arrow exception move")
			}
		} else {
			rejectMovement(t, g, Action{Type: ActResolveChoice, ChoiceID: g.s.PendingChoice.ID, OptionID: "move", Path: []SpaceRef{movementRef("a", 2)}})
		}
	}
	for _, native := range []bool{true, false} {
		g := movementChoiceFixture(t)
		attach := &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "d6"}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "once-per-turn"}}}
		if !native {
			attach.Removes = []string{"move"}
		}
		g.gd.Cards = append(g.gd.Cards, domain.ActionCard{ID: "fixture-cancel", Name: "Synthetic cancellation", Attach: attach})
		g.s.Cybernet.PawnByID(g.actor).Attachments = []domain.Attachment{{CardID: "fixture-cancel", Slot: "gadget", SlotRef: "pawn:gadget"}}
		p, _ := g.gd.PawnByID(g.actor)
		if native {
			p.Movement.Activation = "none"
		}
		if len(EffectiveMovementOptions(g.gd, p, g.s.Cybernet.PawnByID(g.actor).Attachments)) != 0 {
			t.Fatal("movement not cancelled")
		}
		rejectMovement(t, g, Action{Type: ActRollMovement, PawnID: g.actor})
		rejectMovement(t, g, Action{Type: ActPlayMove, PawnID: g.actor, CardID: "dummy", Path: []SpaceRef{movementRef("b"), movementRef("c")}})
		for _, o := range AvailableActions(g.s, g.gd) {
			if o.Action.Type == ActRollMovement || o.Action.Type == ActPlayMove {
				t.Fatal("cancelled move offered")
			}
		}
	}
}
func TestRolledMovementThreatStopAndStealth(t *testing.T) {
	for _, stealth := range []bool{false, true} {
		f := movementChoiceFixture(t)
		f.s.Threats = []domain.ThreatOnBoard{{ID: "fixture-threat", ThreatID: "fixture-guard", Coord: domain.Coord{Q: 2}, SpaceID: "a", Status: "inactive"}}
		index := 0
		if stealth {
			f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-stealth", Name: "Synthetic stealth dice", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "2d6", Stealth: true}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "once-per-turn"}}}})
			f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-stealth", Slot: "gadget", SlotRef: "pawn:gadget"}}
			index = 1
		}
		if !movementBegin(f, Action{MovementIndex: index}).Accepted {
			t.Fatal("threat roll")
		}
		path := []SpaceRef{movementRef("a", 2), movementRef("b", 2)}
		if stealth {
			if !movementFinish(f, path...).Accepted || f.s.PendingThreats != nil || f.s.Threats[0].Status != "inactive" {
				t.Fatal("stealth movement")
			}
		} else {
			if len(mustMovementPreview(t, f, path[0]).NextTargets) != 0 {
				t.Fatal("threat pass offered")
			}
			rejectMovement(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "move", Path: path})
			if !movementFinish(f, path[0]).Accepted || f.s.PendingThreats == nil || f.s.PendingThreats.Stage != "response" || AdvancePhase(f.s, f.gd).Accepted {
				t.Fatal("threat interruption")
			}
		}
	}
}
func TestRolledMovementRejectLegacyDiceUseBudgets(t *testing.T) {
	f := movementChoiceFixture(t)
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-legacy-use-roll", Name: "Unverified legacy use roll", Attach: &domain.Attach{As: "pawn", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 1}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Dice: "d6"}}}})
	if _, err := NewGame(Config{Data: f.gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
		t.Fatal("unverified rolled use budget accepted")
	}
}

func TestMovementCancellationNormalRelocationVersusPlacement(t *testing.T) {
	for _, policy := range []string{"normal-movement", "placement"} {
		f := movementChoiceFixture(t)
		p, _ := f.gd.PawnByID(f.actor)
		p.Movement.Activation = "none"
		f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-relocation", Name: "Synthetic relocation policy", Attach: &domain.Attach{As: "pawn", Slot: "gadget", PhaseEffects: []domain.PhaseEffect{{Trigger: "begin-turn", Kind: "discard-and-relocate", ThreatMode: policy}}}})
		f.s.Cybernet.PawnByID(f.actor).Attachments = []domain.Attachment{{CardID: "fixture-relocation", Slot: "gadget", SlotRef: "pawn:gadget"}}
		f.s.Phase = domain.PhaseBeginning
		if !AdvancePhase(f.s, f.gd).Accepted {
			t.Fatal("phase choice")
		}
		a := Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "relocate", Coord: &domain.Coord{Q: 2}, SpaceID: "a"}
		if policy == "normal-movement" {
			if len(AvailableActions(f.s, f.gd)[0].Targets) != 0 {
				t.Fatal("cancelled relocation offered")
			}
			rejectMovement(t, f, a)
		} else if !ApplyWithEvents(f.s, f.gd, a).Accepted || f.s.Cybernet.PawnByID(f.actor).Coord.Q != 2 {
			t.Fatal("placement should bypass movement cancellation")
		}
	}
}
