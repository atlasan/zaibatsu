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

func weaponGame(t *testing.T) (*domain.GameData, *domain.GameState, string, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-module-adapter", Name: "Synthetic module adapter", Copies: 1, Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsSlot: []string{"module"}}})
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for i := range s.Players {
		s.Deck = append(s.Deck, s.Players[i].Hand...)
		s.Players[i].Hand = nil
	}
	for _, id := range []string{"weapon-gunhed", "ak-12km", "fixture-module-adapter", "servocanon", "dummy", "electric-sheep", "selective-disclosure", "jetpack"} {
		at := slices.Index(s.Deck, id)
		if at < 0 {
			t.Fatal("fixture card missing", id)
		}
		s.Deck = append(s.Deck[:at], s.Deck[at+1:]...)
		s.Players[0].Hand = append(s.Players[0].Hand, id)
	}
	s.Players[0].BonusCounters = 4
	target := s.Players[1].PawnID
	def, _ := gd.PawnByID(target)
	// Synthetic shielded target permits repeated attacks without promoting its profile.
	def.Defense = []domain.DefenseDie{}
	for value := 1; value <= 6; value++ {
		def.Defense = append(def.Defense, domain.DefenseDie{Value: value, Shielded: true})
	}
	return gd, s, s.Players[0].PawnID, target
}
func weaponInstall(t *testing.T, gd *domain.GameData, s *domain.GameState, id string, cards ...string) []EngineEvent {
	t.Helper()
	if len(cards) == 0 {
		cards = []string{"weapon-gunhed", "ak-12km", "fixture-module-adapter", "servocanon"}
	}
	events := []EngineEvent{}
	for _, card := range cards {
		r := ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: card, TargetID: id})
		if !r.Accepted {
			t.Fatal(r)
		}
		events = append(events, r.Events...)
	}
	return events
}
func weaponReject(t *testing.T, gd *domain.GameData, s *domain.GameState, a Action) TransitionResult {
	t.Helper()
	before := Snapshot(s)
	rng := *s.RNG
	r := ApplyWithEvents(s, gd, a)
	after := *s.RNG
	if r.Accepted || Snapshot(s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("rejection mutation", r)
	}
	return r
}
func weaponProfile(gd *domain.GameData, s *domain.GameState, id string) DeleteProfile {
	def, _ := gd.PawnByID(id)
	return PawnDeleteProfile(gd, def, s.Cybernet.PawnByID(id).Attachments)
}

func TestPrintedDeleteBilingualIdentityCostsAndSlots(t *testing.T) {
	gd, s, id, _ := weaponGame(t)
	gun, ak, servo := cardByID(gd, "weapon-gunhed"), cardByID(gd, "ak-12km"), cardByID(gd, "servocanon")
	if gun.Type != "add-on" || !slices.Equal(gun.Class, []string{"brainchip"}) || gun.Attach.Cost != 2 || !slices.Equal(gun.Attach.GrantsSlot, []string{"add-on", "weapon"}) || !reflect.DeepEqual(gun.Attach.Delete, &domain.DeleteAttribute{Skulls: 1, Activation: "card"}) || ak.Type != "weapon" || ak.Attach.Cost != 1 || !reflect.DeepEqual(ak.Attach.Delete, &domain.DeleteAttribute{Skulls: 1}) || servo.Type != "module" || servo.Attach.Cost != 1 || !reflect.DeepEqual(servo.Attach.Delete, &domain.DeleteAttribute{Skulls: 1, Activation: "once-per-turn"}) || !servo.Provisional {
		t.Fatal("printed attributes differ")
	}
	for _, card := range []*domain.ActionCard{gun, ak, servo} {
		if card.Copies != 1 || card.Movement != 2 || !slices.Equal(card.Activates, []string{"delete"}) {
			t.Fatal(card)
		}
	}
	s.Players[0].BonusCounters = 1
	weaponReject(t, gd, s, Action{Type: ActAttachPawn, CardID: gun.ID, TargetID: id})
}
func TestPrintedDeletePublicFreePaidSharedEvidence(t *testing.T) {
	gd, s, id, _ := weaponGame(t)
	cards := slotInventory(s)
	events := weaponInstall(t, gd, s, id)
	def, _ := gd.PawnByID(id)
	if weaponProfile(gd, s, id) != (DeleteProfile{Skulls: 3, Card: true, FreeActivators: 1}) || s.Players[0].BonusCounters != 0 || !slices.Equal(EffectivePawnClasses(gd, s.Cybernet.PawnByID(id)), []string{"operative", "brainchip"}) {
		t.Fatal("profile mismatch")
	}
	before := Snapshot(s)
	rng := *s.RNG
	options := []Action{}
	free, paid := false, false
	for _, option := range AvailableActions(s, gd) {
		if option.Action.Type == ActRollDelete {
			options = append(options, option.Action)
			free = free || option.Action.CardID == ""
			paid = paid || option.Action.CardID == "dummy"
		}
	}
	after := *s.RNG
	if !free || !paid || Snapshot(s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("options mutation")
	}
	type stage struct {
		Label string          `json:"label"`
		State json.RawMessage `json:"state"`
	}
	stages := []stage{{"installed", json.RawMessage(before)}}
	for _, card := range []string{"", "dummy", "electric-sheep"} {
		hand := len(s.Players[0].Hand)
		r := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: card})
		events = append(events, r.Events...)
		cost := 0
		if card != "" {
			cost = 1
		}
		if !r.Accepted || s.PendingAttack == nil || len(s.PendingAttack.Roll) != 3 || len(s.Players[0].Hand) != hand-cost || !AbilityUseSpent(s, gd, s.Players[0], id, "delete") {
			t.Fatal(r)
		}
		label := card
		if label == "" {
			label = "free"
		}
		stages = append(stages, stage{label, json.RawMessage(Snapshot(s))})
		weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy"})
		weaponReject(t, gd, s, Action{Type: ActAssignDelete, TargetIDs: []string{""}})
		assigned := ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{"", "", ""}})
		if !assigned.Accepted {
			t.Fatal(assigned)
		}
		events = append(events, assigned.Events...)
		weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id})
	}
	for _, o := range AvailableActions(s, gd) {
		if o.Action.Type == ActRollDelete && o.Action.CardID == "" {
			t.Fatal("spent free option")
		}
	}
	for phase := 0; phase < 8; phase++ {
		r := AdvancePhase(s, gd)
		if !r.Accepted {
			t.Fatal(r)
		}
		events = append(events, r.Events...)
	}
	if AbilityUseSpent(s, gd, s.Players[0], id, "delete") || len(DeleteActivationOptions(gd, def, s.Cybernet.PawnByID(id).Attachments)) != 2 {
		t.Fatal("reset mismatch")
	}
	if !slices.Equal(cards, slotInventory(s)) {
		t.Fatal("physical cards not conserved")
	}
	stages = append(stages, stage{"next-turn", json.RawMessage(Snapshot(s))})
	evidence := struct {
		Profile DeleteProfile `json:"profile"`
		Options []Action      `json:"options"`
		Stages  []stage       `json:"stages"`
		Events  []EngineEvent `json:"events"`
	}{weaponProfile(gd, s, id), options, stages, events}
	raw, _ := json.Marshal(evidence)
	var want, got any
	if json.Unmarshal([]byte(readGolden(t, "delete-attributes.json")), &want) != nil || json.Unmarshal(raw, &got) != nil || !reflect.DeepEqual(want, got) {
		t.Fatal("Delete golden mismatch", string(raw))
	}
}
func TestPrintedDeleteStrengthAndActivationAreIndependent(t *testing.T) {
	gd, s, id, target := weaponGame(t)
	def, _ := gd.PawnByID(id)
	def.Slots = append(def.Slots, "weapon")
	weaponInstall(t, gd, s, id, "ak-12km")
	if weaponProfile(gd, s, id) != (DeleteProfile{Skulls: 1}) {
		t.Fatal("bare skull invented activation")
	}
	for _, o := range AvailableActions(s, gd) {
		if o.Action.Type == ActRollDelete {
			t.Fatal("bare skull attack offered")
		}
	}
	weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy"})
	weaponInstall(t, gd, s, id, "fixture-module-adapter", "servocanon")
	if weaponProfile(gd, s, id).Skulls != 2 {
		t.Fatal("strength mismatch")
	}
	weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy"})
	weaponReject(t, gd, s, Action{Type: ActPlayDelete, PawnID: id, TargetID: target, CardID: "dummy"})
	r := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id})
	if !r.Accepted || len(s.PendingAttack.Roll) != 2 {
		t.Fatal(r)
	}
}
func TestPrintedDeleteConflictingFreeBadgesRejectAtomically(t *testing.T) {
	gd, s, id, target := weaponGame(t)
	def, _ := gd.PawnByID(id)
	def.Abilities = append(def.Abilities, domain.Ability{Ability: "delete", Activation: "once-per-turn", Skulls: 2})
	weaponInstall(t, gd, s, id)
	if weaponProfile(gd, s, id) != (DeleteProfile{Skulls: 5, Card: true, FreeActivators: 2}) {
		t.Fatal("native strength mismatch")
	}
	for _, a := range []Action{{Type: ActRollDelete, PawnID: id}, {Type: ActDelete, PawnID: id, TargetID: target}} {
		if !strings.Contains(weaponReject(t, gd, s, a).Error, "English and Spanish") {
			t.Fatal("missing provisional conflict")
		}
	}
	for _, o := range AvailableActions(s, gd) {
		if o.Action.Type == ActRollDelete && o.Action.CardID == "" {
			t.Fatal("ambiguous free route offered")
		}
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy"})
	if !r.Accepted || len(s.PendingAttack.Roll) != 5 || len(UseMarkerAllocations(s)) != 0 {
		t.Fatal(r)
	}
}
func TestPrintedDeleteCancellationAndTakeoverRefund(t *testing.T) {
	gd, s, id, target := weaponGame(t)
	weaponInstall(t, gd, s, id)
	def, _ := gd.PawnByID(id)
	def.Class = []string{"fixture-subject"}
	def.IceFaces = []int{1, 2, 3, 4, 5, 6}
	s.CurrentPlayer = 1
	s.Players[1].Hand = []string{"under-clocker", "dj"}
	r := ApplyWithEvents(s, gd, Action{Type: ActAttachEnemy, PawnID: target, TargetID: id, CardID: "under-clocker", SlotRef: "pawn:add-on/add-on"})
	if !r.Accepted {
		t.Fatal(r)
	}
	s.CurrentPlayer = 0
	if !weaponProfile(gd, s, id).Cancelled || len(DeleteActivationOptions(gd, def, s.Cybernet.PawnByID(id).Attachments)) != 0 {
		t.Fatal("cancellation missed activation")
	}
	weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id})
	weaponReject(t, gd, s, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy"})
	s.CurrentPlayer = 1
	r = ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakPawn, PawnID: target, TargetID: id, CardID: "dj"})
	if !r.Accepted || s.Players[0].BonusCounters != 4 || len(s.Cybernet.PawnByID(id).Attachments) != 0 || weaponProfile(gd, s, id).Skulls != 0 {
		t.Fatal(r)
	}
}
func TestPrintedDeleteJointUsesInitiatorAndBareSkullContributor(t *testing.T) {
	gd, s, id, target := weaponGame(t)
	weaponInstall(t, gd, s, id, "weapon-gunhed")
	SetPawnControl(s, target, "p1")
	def, _ := gd.PawnByID(target)
	def.Slots = append(def.Slots, "weapon")
	r := ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, TargetID: target, CardID: "ak-12km"})
	if !r.Accepted {
		t.Fatal(r)
	}
	faces := []domain.DefenseDie{}
	for value := 1; value <= 6; value++ {
		faces = append(faces, domain.DefenseDie{Value: value, Shielded: true})
	}
	gd.Threats = []domain.Threat{{ID: "fixture-token", Name: "Synthetic shielded threat", Type: "token", AttackDie: 5, Defense: faces}}
	s.Threats = []domain.ThreatOnBoard{{ID: "t1", ThreatID: "fixture-token", Coord: domain.Coord{}, SpaceID: "core", Status: "inactive"}}
	offered := false
	for _, o := range AvailableActions(s, gd) {
		offered = offered || (o.Action.Type == ActRollDelete && o.Action.Joint && o.Action.PawnID == id)
	}
	if !offered {
		t.Fatal("joint option absent")
	}
	r = ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: "dummy", Joint: true})
	if !r.Accepted || !slices.Equal(s.PendingAttack.AttackerIDs, []string{id, target}) || len(s.PendingAttack.Roll) != 2 || len(UseMarkerAllocations(s)) != 0 {
		t.Fatal(r)
	}
}
func TestPrintedDeleteMalformedDefinitions(t *testing.T) {
	for _, attach := range []*domain.Attach{{As: "pawn", Slot: "weapon", Delete: &domain.DeleteAttribute{Skulls: 0}}, {As: "pawn", Slot: "weapon", Delete: &domain.DeleteAttribute{Skulls: 1, Activation: "unknown"}}, {As: "block", Delete: &domain.DeleteAttribute{Skulls: 1}}, {As: "pawn", Delete: &domain.DeleteAttribute{Skulls: 1}, Grants: []string{"delete"}}, {As: "pawn", Delete: &domain.DeleteAttribute{Skulls: 1}, AbilityUses: []domain.AbilityUse{{Ability: "delete", Activation: "card"}}}, {As: "pawn", Grants: []string{"delete"}, AbilityUses: []domain.AbilityUse{{Ability: "delete", PerTurn: 2}}}} {
		gd, _, _, _ := weaponGame(t)
		gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-invalid", Name: "Invalid Delete", Attach: attach})
		if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "Delete") {
			t.Fatal(err)
		}
	}
}

func TestPrintedDeleteDirectSplitAreaSeparateFreeActivation(t *testing.T) {
	gd, s, id, target := weaponGame(t)
	weaponInstall(t, gd, s, id)
	direct := ApplyWithEvents(s, gd, Action{Type: ActPlayDelete, PawnID: id, TargetID: target, CardID: "dummy"})
	if !direct.Accepted || len(UseMarkerAllocations(s)) != 0 {
		t.Fatal(direct)
	}
	roll := 0
	for _, e := range direct.Events {
		if e.Type == EventRoll {
			roll = len(e.Roll)
		}
	}
	if roll != 3 {
		t.Fatal("direct strength")
	}
	split := ApplyWithEvents(s, gd, Action{Type: ActDeleteMulti, PawnID: id, TargetIDs: []string{target, target, target}})
	if !split.Accepted || !AbilityUseSpent(s, gd, s.Players[0], id, "delete") {
		t.Fatal(split)
	}
	def, _ := gd.PawnByID(id)
	def.Class = append(def.Class, "bomb")
	def.Defense = []domain.DefenseDie{}
	for value := 1; value <= 6; value++ {
		def.Defense = append(def.Defense, domain.DefenseDie{Value: value, Shielded: true})
	}
	area := ApplyWithEvents(s, gd, Action{Type: ActPlayDeleteArea, PawnID: id, CardID: "electric-sheep"})
	if !area.Accepted {
		t.Fatal(area)
	}
	roll = 0
	for _, e := range area.Events {
		if e.Type == EventRoll {
			roll = len(e.Roll)
		}
	}
	if roll != 3 {
		t.Fatal("area strength")
	}
	weaponReject(t, gd, s, Action{Type: ActDeleteArea, PawnID: id})
}
