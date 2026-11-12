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

func useMarkerFixture(t *testing.T) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	board := malwareLabBlock()
	board.ID = "fixture-marker-board"
	board.Name = "Synthetic marker board"
	board.IceValue = ""
	board.IceFaces = nil
	gd.Blocks = append(gd.Blocks, board)
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-provider", Name: "Synthetic provider", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "armor", GrantsSlot: []string{"gadget"}}}, domain.ActionCard{ID: "fixture-mover", Name: "Synthetic duplicate mover", Copies: 2, Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 2}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "once-per-turn", PerTurn: 1}}}})
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for i := range s.Players {
		s.Deck = append(s.Deck, s.Players[i].Hand...)
		s.Players[i].Hand = nil
	}
	for _, p := range s.Cybernet.Pawns {
		p.Coord = domain.Coord{Q: 1}
		p.SpaceID = "a"
	}
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: board.ID, Coord: domain.Coord{Q: 1}})
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == board.ID })
	return malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
}
func useMarkerCommand(t *testing.T, f malwareFixture, a Action) TransitionResult {
	t.Helper()
	r := ApplyWithEvents(f.s, f.gd, a)
	if !r.Accepted {
		t.Fatal(r)
	}
	return r
}
func nativeMarkerSpent(t *testing.T) (malwareFixture, TransitionResult) {
	t.Helper()
	f := useMarkerFixture(t)
	p, _ := f.gd.PawnByID(f.target)
	p.Movement = domain.Movement{Type: "steps", Steps: 2, Activation: "once-per-turn"}
	p.Class = []string{"cleaner"}
	f.s.CurrentPlayer = 1
	r := useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.target, Path: []SpaceRef{movementRef("b")}})
	return f, r
}
func duplicateMarkerFixture(t *testing.T) malwareFixture {
	t.Helper()
	f := useMarkerFixture(t)
	for _, id := range []string{"fixture-provider", "fixture-mover", "fixture-mover"} {
		f.take(t, 0, id)
	}
	for _, pair := range [][2]string{{"fixture-provider", "pawn:armor"}, {"fixture-mover", "pawn:gadget"}, {"fixture-mover", "pawn:armor/gadget"}} {
		useMarkerCommand(t, f, Action{Type: ActAttachPawn, CardID: pair[0], TargetID: f.actor, SlotRef: pair[1]})
	}
	return f
}
func markerEvidence(t *testing.T, key string, value any) {
	t.Helper()
	var all map[string]any
	_ = json.Unmarshal([]byte(readGolden(t, "use-markers.json")), &all)
	b, _ := json.Marshal(value)
	var got any
	_ = json.Unmarshal(b, &got)
	if !reflect.DeepEqual(got, all[key]) {
		t.Fatal("physical marker shared evidence mismatch", key, string(b))
	}
}

func TestPhysicalNativeMarkerControlTransferSharedEvidence(t *testing.T) {
	f, used := nativeMarkerSpent(t)
	spent := json.RawMessage(Snapshot(f.s))
	rng := *f.s.RNG
	f.take(t, 0, "virus")
	f.s.CurrentPlayer = 0
	capture := useMarkerCommand(t, f, Action{Type: ActAttachEnemy, CardID: "virus", PawnID: f.actor, TargetID: f.target})
	captured := json.RawMessage(Snapshot(f.s))
	if UseMarkerAllocations(f.s)[0].OwnerID != "p1" {
		t.Fatal("marker lost control-card ownership")
	}
	rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.target, Path: []SpaceRef{movementRef("a")}})
	ClearControlledUseMarkers(f.s, "p2")
	observer := mustView(t, f, "p2")
	if len(observer.UseMarkers) != 1 || len(observer.Options) != 0 {
		t.Fatal(observer)
	}
	f.s.Phase = domain.PhaseBeginning
	reset := AdvancePhase(f.s, f.gd)
	if !reset.Accepted || len(UseMarkerAllocations(f.s)) != 0 || len(reset.Events) != 2 || reset.Events[0].Type != "ability-use-cleared" || reset.Events[1].Type != "phase-advanced" {
		t.Fatal(reset)
	}
	events := append(append(used.Events, capture.Events...), reset.Events...)
	markerEvidence(t, "native", map[string]any{"spent": spent, "captured": captured, "observer": observer, "reset": json.RawMessage(Snapshot(f.s)), "events": events})
	actual := *f.s.RNG
	if actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("marker lifecycle consumed RNG")
	}
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.target, Path: []SpaceRef{movementRef("a")}})
}
func TestPhysicalDuplicateMarkersAndUnrelatedRemoval(t *testing.T) {
	f := duplicateMarkerFixture(t)
	cards := slotInventory(f.s)
	atts := f.s.Cybernet.PawnByID(f.actor).Attachments
	ids := []string{atts[0].InstanceID, atts[1].InstanceID, atts[2].InstanceID}
	if ids[0] == ids[1] || ids[1] == ids[2] || ids[0] == ids[2] {
		t.Fatal(ids)
	}
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1, Path: []SpaceRef{movementRef("b")}})
	if len(atts[1].UseMarkers) != 1 || atts[1].UseMarkers[0].Ability != "move:0" || len(atts[2].UseMarkers) != 0 {
		t.Fatal(atts)
	}
	offered := false
	for _, o := range AvailableActions(f.s, f.gd) {
		if o.Action.Type == ActMoveSteps && o.Action.MovementIndex == 2 {
			offered = true
		}
	}
	if !offered {
		t.Fatal("unused physical duplicate was not offered")
	}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor), 0, nil)
	if f.s.Cybernet.PawnByID(f.actor).Attachments[0].InstanceID != ids[1] || len(f.s.UnresolvedUseCards) != 0 {
		t.Fatal("unrelated removal refreshed identity")
	}
	rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1, Path: []SpaceRef{movementRef("a")}})
	if !reflect.DeepEqual(slotInventory(f.s), cards) {
		t.Fatal("cards not conserved")
	}
	f.s.Phase = domain.PhaseBeginning
	AdvancePhase(f.s, f.gd)
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1, Path: []SpaceRef{movementRef("a")}})
}
func TestPhysicalProviderCleanupRetainsUnresolvedMarker(t *testing.T) {
	f := duplicateMarkerFixture(t)
	cards := slotInventory(f.s)
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 2, Path: []SpaceRef{movementRef("b")}})
	id := f.s.Cybernet.PawnByID(f.actor).Attachments[2].InstanceID
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor), 0, nil)
	if len(f.s.UnresolvedUseCards) != 1 || f.s.UnresolvedUseCards[0].InstanceID != id || f.s.UnresolvedUseCards[0].UseMarkers[0].Uses != 1 {
		t.Fatal(f.s.UnresolvedUseCards)
	}
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1, Path: []SpaceRef{movementRef("a")}})
	ClearControlledUseMarkers(f.s, "p1")
	if len(f.s.UnresolvedUseCards) != 1 {
		t.Fatal("unresolved marker silently cleared")
	}
	f.s.Discard = append(f.s.Discard, f.s.Deck...)
	f.s.Deck = nil
	for {
		card, ok := draw(f.s)
		if !ok {
			t.Fatal("fixture card not redrawn")
		}
		f.s.Players[0].Hand = append(f.s.Players[0].Hand, card)
		if card == "fixture-mover" {
			break
		}
	}
	r := rejectMovement(t, f, Action{Type: ActAttachPawn, CardID: "fixture-mover", TargetID: f.actor, SlotRef: "pawn:gadget"})
	if !strings.Contains(r.Error, "unresolved") {
		t.Fatal(r)
	}
	if !reflect.DeepEqual(slotInventory(f.s), cards) {
		t.Fatal("evidence counted as additional physical card")
	}
}
func TestPhysicalNativeMarkerRetainedAndCommonCards(t *testing.T) {
	for _, retained := range []bool{true, false} {
		f, _ := nativeMarkerSpent(t)
		if !retained {
			p, _ := f.gd.PawnByID(f.target)
			p.Abilities = nil
		}
		if !finalizePawnElimination(f.s, f.target, f.gd, nil) || len(UseMarkerAllocations(f.s)) != 1 {
			t.Fatal("elimination lost marker")
		}
		if retained {
			if !slices.Contains(f.s.Eliminated, f.target) {
				t.Fatal("expected retained card")
			}
			ClearControlledUseMarkers(f.s, "p1")
			if len(UseMarkerAllocations(f.s)) != 1 {
				t.Fatal("other player cleared retained marker")
			}
			ClearControlledUseMarkers(f.s, "p2")
			if len(UseMarkerAllocations(f.s)) != 0 {
				t.Fatal("owner failed to clear retained marker")
			}
		} else {
			if !slices.Contains(f.s.Reserve, f.target) {
				t.Fatal("expected reserve")
			}
			ClearControlledUseMarkers(f.s, "p2")
			if UseMarkerAllocations(f.s)[0].OwnerID != "" {
				t.Fatal("common card kept prior owner")
			}
			f.s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: f.target, OwnerID: "p1", Coord: domain.Coord{Q: 1}, SpaceID: "a"})
			f.s.Reserve = slices.DeleteFunc(f.s.Reserve, func(id string) bool { return id == f.target })
			SetPawnControl(f.s, f.target, "p1")
			f.s.CurrentPlayer = 0
			rejectMovement(t, f, Action{Type: ActMoveSteps, PawnID: f.target, Path: []SpaceRef{movementRef("b")}})
			ClearControlledUseMarkers(f.s, "p1")
			useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.target, Path: []SpaceRef{movementRef("b")}})
		}
	}
}
func TestPhysicalNativeAbilityReferences(t *testing.T) {
	for _, ability := range []string{"delete", "search", "icebreaker", "reboot"} {
		f := useMarkerFixture(t)
		p, _ := f.gd.PawnByID(f.actor)
		p.Abilities = []domain.Ability{{Ability: ability, Activation: "once-per-turn"}}
		a := Action{PawnID: f.actor}
		switch ability {
		case "delete":
			p.Abilities[0].Skulls = 1
			target, _ := f.gd.PawnByID(f.target)
			target.Defense = nil
			for i := 1; i <= 6; i++ {
				target.Defense = append(target.Defense, domain.DefenseDie{Value: i, Shielded: true})
			}
			a.Type = ActDelete
			a.TargetID = f.target
		case "search":
			a.Type = ActSearch
		case "icebreaker":
			target, _ := f.gd.PawnByID(f.target)
			target.IceFaces = []int{1, 2, 3, 4, 5, 6}
			a.Type = ActIcebreakPawn
			a.TargetID = f.target
		case "reboot":
			finalizePawnElimination(f.s, f.actor, f.gd, nil)
			a.Type = ActReboot
		}
		useMarkerCommand(t, f, a)
		found := false
		for _, m := range UseMarkerAllocations(f.s) {
			if m.PawnID == f.actor && m.Ability == ability && m.Uses == 1 {
				found = true
			}
		}
		if !found {
			t.Fatal("missing physical reference", ability)
		}
	}
}
func TestPhysicalMarkerViewsAndClonesArePure(t *testing.T) {
	f := duplicateMarkerFixture(t)
	useMarkerCommand(t, f, Action{Type: ActMoveSteps, PawnID: f.actor, MovementIndex: 1, Path: []SpaceRef{movementRef("b")}})
	before := Snapshot(f.s)
	rng := *f.s.RNG
	copy := CloneState(f.s)
	view := mustView(t, f, "p1")
	copy.Cybernet.PawnByID(f.actor).Attachments[1].UseMarkers[0].Uses = 99
	view.UseMarkers[0].Uses = 99
	view.Pawns[0].Attachments[1].UseMarkers[0].Uses = 99
	AvailableActions(f.s, f.gd)
	actual := *f.s.RNG
	if Snapshot(f.s) != before || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("view/clone mutated source state")
	}
	DiscardPawnAttachment(f.s, f.gd, f.s.Cybernet.PawnByID(f.actor), 1, nil)
	before = Snapshot(f.s)
	copy = CloneState(f.s)
	copy.UnresolvedUseCards[0].UseMarkers[0].Uses = 99
	if Snapshot(f.s) != before {
		t.Fatal("unresolved evidence was shallow cloned")
	}
}

func TestPhysicalMarkersOfficialBundleRejectsUnresolvedLifetime(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return b.ID != "central-core" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.ControlCards = nil
	gd.Cards = []domain.ActionCard{{ID: "fixture-limited", Name: "Synthetic limited card", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 1}}, AbilityUses: []domain.AbilityUse{{Ability: "move", PerTurn: 1}}}}}
	_, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err == nil || !strings.Contains(err.Error(), "unresolved discarded-card use-marker lifetime") {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42, AllowProvisional: true})
	if err != nil || s.RulesVersion != "source-v21" {
		t.Fatal(s, err)
	}
}
