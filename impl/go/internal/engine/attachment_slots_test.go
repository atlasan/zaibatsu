package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"sort"
	"testing"
)

func slotGame(t *testing.T) (*domain.GameData, *domain.GameState, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Cards = append(gd.Cards,
		domain.ActionCard{ID: "fixture-slot-bridge", Name: "Synthetic slot bridge", Copies: 2, Class: []string{"fixture-chip"}, Attach: &domain.Attach{As: "pawn", Slot: "add-on", Cost: 1, GrantsSlot: []string{"add-on", "weapon"}}},
		domain.ActionCard{ID: "fixture-expiring-bridge", Name: "Synthetic expiring bridge", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "add-on", Cost: 2, GrantsSlot: []string{"add-on", "weapon"}, PhaseEffects: []domain.PhaseEffect{{Trigger: "begin-turn", Kind: "discard-self"}}}},
		domain.ActionCard{ID: "fixture-module-carrier", Name: "Synthetic module carrier", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "weapon", Cost: 1, GrantsSlot: []string{"module"}}},
		domain.ActionCard{ID: "fixture-module", Name: "Synthetic module", Copies: 1, Class: []string{"fixture-module"}, Attach: &domain.Attach{As: "pawn", Slot: "module", Cost: 2, MovementModifier: 1}},
		domain.ActionCard{ID: "fixture-gadget-bridge", Name: "Synthetic gadget bridge", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "armor", GrantsSlot: []string{"gadget"}}},
		domain.ActionCard{ID: "fixture-gadget", Name: "Synthetic gadget", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "gadget", Cost: 1, HandModifier: 1}},
	)
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for i := range s.Players {
		s.Deck = append(s.Deck, s.Players[i].Hand...)
		s.Players[i].Hand = nil
	}
	for _, id := range []string{"fixture-expiring-bridge", "fixture-slot-bridge", "fixture-slot-bridge", "fixture-module-carrier", "fixture-module", "fixture-gadget-bridge", "fixture-gadget", "dummy"} {
		at := slices.Index(s.Deck, id)
		if at < 0 {
			t.Fatal("fixture card missing")
		}
		s.Deck = append(s.Deck[:at], s.Deck[at+1:]...)
		s.Players[0].Hand = append(s.Players[0].Hand, id)
	}
	s.Players[0].BonusCounters = 10
	return gd, s, s.Players[0].PawnID
}
func slotAttach(t *testing.T, s *domain.GameState, gd *domain.GameData, pawnID, cardID, ref string) TransitionResult {
	t.Helper()
	r := ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: cardID, TargetID: pawnID, SlotRef: ref})
	if !r.Accepted {
		t.Fatal(r)
	}
	return r
}
func slotInventory(s *domain.GameState) []string {
	out := append([]string{}, s.Deck...)
	out = append(out, s.Discard...)
	out = append(out, s.PlayedCards...)
	for _, p := range s.Players {
		out = append(out, p.Hand...)
	}
	for _, p := range s.Cybernet.Pawns {
		for _, att := range p.Attachments {
			out = append(out, att.CardID)
		}
	}
	sort.Strings(out)
	return out
}
func TestAttachmentSlotsDistinctPhysicalCopiesAndChoices(t *testing.T) {
	gd, s, id := slotGame(t)
	cards := slotInventory(s)
	slotAttach(t, s, gd, id, "fixture-slot-bridge", "")
	slotAttach(t, s, gd, id, "fixture-slot-bridge", "")
	if a := s.Cybernet.PawnByID(id).Attachments; a[0].SlotRef != "pawn:add-on" || a[1].SlotRef != "pawn:add-on/add-on" {
		t.Fatal(a)
	}
	before := Snapshot(s)
	rng := *s.RNG
	options := []Action{}
	for _, o := range AvailableActions(s, gd) {
		if o.Action.Type == ActAttachPawn && o.Action.CardID == "fixture-module-carrier" {
			options = append(options, o.Action)
		}
	}
	after := *s.RNG
	if len(options) != 2 || options[0].SlotRef != "pawn:add-on/weapon" || options[1].SlotRef != "pawn:add-on/add-on/weapon" || Snapshot(s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("choice/query mismatch", options)
	}
	restrictionReject(t, s, gd, Action{Type: ActAttachPawn, CardID: "fixture-module-carrier", TargetID: id})
	for _, bad := range []string{"pawn:weapon", "pawn:add-on"} {
		a := options[0]
		a.SlotRef = bad
		restrictionReject(t, s, gd, a)
	}
	if r := ApplyWithEvents(s, gd, options[1]); !r.Accepted {
		t.Fatal(r)
	}
	slotAttach(t, s, gd, id, "fixture-module", "")
	atts := s.Cybernet.PawnByID(id).Attachments
	paid := 0
	for _, a := range atts {
		paid += a.BonusPaid
	}
	if atts[len(atts)-1].SlotRef != "pawn:add-on/add-on/weapon/module" || !slices.Equal(cards, slotInventory(s)) || paid+s.Players[0].BonusCounters != 10 {
		t.Fatal("state/conservation mismatch")
	}
	clone := CloneState(s)
	clone.Cybernet.PawnByID(id).Attachments[0].SlotRef = "changed"
	if Snapshot(clone) == Snapshot(s) {
		t.Fatal("clone reference shared")
	}
}
func TestAttachmentSlotsNativeAndGrantedSameType(t *testing.T) {
	gd, s, id := slotGame(t)
	slotAttach(t, s, gd, id, "fixture-gadget-bridge", "")
	restrictionReject(t, s, gd, Action{Type: ActAttachPawn, CardID: "fixture-gadget", TargetID: id})
	free := AvailableAttachmentSlots(gd, s.Cybernet.PawnByID(id), "gadget")
	if len(free) != 2 || free[0].Ref != "pawn:gadget" || free[1].Ref != "pawn:armor/gadget" {
		t.Fatal(free)
	}
	slotAttach(t, s, gd, id, "fixture-gadget", "pawn:armor/gadget")
	s.Players[0].Hand = append(s.Players[0].Hand, "fixture-gadget")
	restrictionReject(t, s, gd, Action{Type: ActAttachPawn, CardID: "fixture-gadget", TargetID: id, SlotRef: "pawn:armor/gadget"})
	restrictionReject(t, s, gd, Action{Type: ActPass, SlotRef: "pawn:gadget"})
	free = AvailableAttachmentSlots(gd, s.Cybernet.PawnByID(id), "gadget")
	if len(free) != 1 || free[0].Ref != "pawn:gadget" {
		t.Fatal(free)
	}
}
func TestAttachmentSlotsPhaseCascadeSharedEvidence(t *testing.T) {
	gd, s, id := slotGame(t)
	cards := slotInventory(s)
	events := []EngineEvent{}
	for _, pair := range [][2]string{{"fixture-expiring-bridge", "pawn:add-on"}, {"fixture-slot-bridge", "pawn:add-on/add-on"}, {"fixture-module-carrier", "pawn:add-on/weapon"}, {"fixture-module", "pawn:add-on/weapon/module"}, {"fixture-gadget", "pawn:gadget"}} {
		r := slotAttach(t, s, gd, id, pair[0], pair[1])
		events = append(events, r.Events...)
	}
	attached := Snapshot(s)
	s.Phase = domain.PhaseBeginning
	phase := AdvancePhase(s, gd)
	if !phase.Accepted {
		t.Fatal(phase)
	}
	events = append(events, phase.Events...)
	pawn := s.Cybernet.PawnByID(id)
	_, hand := PlayerAttachmentModifiers(s, gd, "p1")
	if !slices.Equal(s.Discard, []string{"fixture-expiring-bridge", "fixture-slot-bridge", "fixture-module-carrier", "fixture-module"}) || len(pawn.Attachments) != 1 || pawn.Attachments[0].CardID != "fixture-gadget" || s.Players[0].BonusCounters != 9 || !slices.Equal(EffectivePawnClasses(gd, pawn), []string{"operative"}) || hand != 1 || !slices.Equal(cards, slotInventory(s)) {
		t.Fatal("cascade/conservation mismatch", Snapshot(s))
	}
	evidence := struct {
		Attached json.RawMessage `json:"attached"`
		After    json.RawMessage `json:"after"`
		Events   []EngineEvent   `json:"events"`
	}{json.RawMessage(attached), json.RawMessage(Snapshot(s)), events}
	raw, _ := json.Marshal(evidence)
	var want, got any
	if json.Unmarshal([]byte(readGolden(t, "attachment-slots.json")), &want) != nil || json.Unmarshal(raw, &got) != nil || !reflect.DeepEqual(want, got) {
		t.Fatal("slot cascade golden mismatch", string(raw))
	}
}
func TestAttachmentSlotsPreventionCascadeCannotReassign(t *testing.T) {
	gd, s, id := slotGame(t)
	cardByID(gd, "dummy").Attach.GrantsSlot = []string{"weapon"}
	for _, card := range []string{"dummy", "fixture-module-carrier", "fixture-module", "fixture-gadget"} {
		slotAttach(t, s, gd, id, card, "")
	}
	def, _ := gd.PawnByID(id)
	def.Slots = append(def.Slots, "weapon")
	s.CurrentPlayer = 1
	if _, err := attemptEliminatePawn(s, gd, id, "attack"); err != nil {
		t.Fatal(err)
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, PlayerID: "p1", OptionID: "prevent", CardID: "dummy"})
	atts := s.Cybernet.PawnByID(id).Attachments
	if !r.Accepted || !slices.Equal(s.Discard, []string{"dummy", "fixture-module-carrier", "fixture-module"}) || len(atts) != 1 || atts[0].CardID != "fixture-gadget" || s.Players[0].BonusCounters != 9 {
		t.Fatal(r, Snapshot(s))
	}
}
func TestAttachmentSlotsGroundedProvidersAndFixtureInference(t *testing.T) {
	gd, s, id := slotGame(t)
	pawn := s.Cybernet.PawnByID(id)
	pawn.Attachments = []domain.Attachment{{CardID: "fixture-module-carrier", Slot: "weapon", SlotRef: "pawn:module/weapon"}, {CardID: "fixture-module", Slot: "module", SlotRef: "pawn:module/weapon/module"}}
	if len(AvailableAttachmentSlots(gd, pawn, "weapon")) != 0 || len(AvailableAttachmentSlots(gd, pawn, "module")) != 0 {
		t.Fatal("ungrounded grant")
	}
	pawn.Attachments = []domain.Attachment{{CardID: "fixture-slot-bridge", Slot: "add-on"}, {CardID: "fixture-module-carrier", Slot: "weapon"}, {CardID: "fixture-module", Slot: "module"}}
	before := Snapshot(s)
	refs := []string{}
	for _, slot := range PawnAttachmentSlots(gd, pawn) {
		if slot.Occupied {
			refs = append(refs, slot.Ref)
		}
	}
	if !slices.Equal(refs, []string{"pawn:add-on", "pawn:add-on/weapon", "pawn:add-on/weapon/module"}) || Snapshot(s) != before {
		t.Fatal("fixture inference mutation", refs)
	}
	DiscardPawnAttachment(s, gd, pawn, 0, nil)
	if len(pawn.Attachments) != 0 {
		t.Fatal("fixture cascade failed")
	}
}
func TestAttachmentSlotsRegressionKeepsHistoricalOccupancy(t *testing.T) {
	gd, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-slot-bridge", Name: "Historical synthetic bridge", Attach: &domain.Attach{As: "pawn", Slot: "add-on", GrantsSlot: []string{"add-on"}}})
	pawn := s.Cybernet.Pawns[0]
	pawn.Attachments = []domain.Attachment{{CardID: "fixture-slot-bridge", Slot: "add-on"}}
	if len(AvailableAttachmentSlots(gd, pawn, "add-on")) != 0 {
		t.Fatal("historical occupancy changed")
	}
}
