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

func phaseCardGame(t *testing.T, cardID string) (*domain.GameData, *domain.GameState, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	pawn := s.Cybernet.PawnByID(s.Players[0].PawnID)
	pawn.Attachments = []domain.Attachment{{CardID: cardID, Slot: "add-on", BonusPaid: cardByID(gd, cardID).Attach.Cost}}
	s.Players[0].Hand = []string{"dj", "dj", "octagon-dex"}
	s.Players[0].OncePerTurnUsed = map[string]bool{"old": true}
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "destination", Name: "Synthetic destination", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceNone, Spaces: []domain.Space{{ID: "free", Type: "special", Capacity: 1, Neighbors: []string{}}, {ID: "occupied", Type: "special", Capacity: 1, Neighbors: []string{}}}})
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "destination", Coord: domain.Coord{Q: 8}, Rotation: 0})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "idoru", OwnerID: "p2", Coord: domain.Coord{Q: 8}, SpaceID: "occupied"})
	for i, id := range s.Reserve {
		if id == "idoru" {
			s.Reserve = append(s.Reserve[:i], s.Reserve[i+1:]...)
			break
		}
	}
	return gd, s, pawn.PawnID
}
func phaseCardCount(s *domain.GameState) int {
	n := len(s.Deck) + len(s.Discard)
	for _, p := range s.Players {
		n += len(p.Hand)
	}
	for _, p := range s.Cybernet.Pawns {
		n += len(p.Attachments)
	}
	return n
}

func TestPhaseElectricSheepSacrificeDrawConservation(t *testing.T) {
	gd, s, id := phaseCardGame(t, "electric-sheep")
	s.Players[0].Hand = []string{"dj", "dj", "dj", "dj", "dj", "dj"}
	s.Deck = nil
	s.Discard = []string{"octagon-dex", "biochip"}
	count := phaseCardCount(s)
	otherGD, other, _ := phaseCardGame(t, "electric-sheep")
	other.Players[0].Hand = append([]string{}, s.Players[0].Hand...)
	other.Deck = nil
	other.Discard = append([]string{}, s.Discard...)
	result := AdvancePhase(s, gd)
	var expected []EngineEvent
	if err := json.Unmarshal([]byte(readGolden(t, "phase-sacrifice.events.json")), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(result.Events, expected) {
		t.Fatal("sacrifice/draw event parity", result.Events)
	}
	if !result.Accepted || !slices.Contains(s.Eliminated, id) || s.Players[0].BonusCounters != 2 || len(s.Players[0].Hand) != 9 || s.Phase != domain.PhaseAction || s.PendingPhase != "" || phaseCardCount(s) != count {
		t.Fatal(result, Snapshot(s))
	}
	drawn := append([]string{}, s.Players[0].Hand[6:]...)
	slices.Sort(drawn)
	if !slices.Equal(drawn, []string{"biochip", "electric-sheep", "octagon-dex"}) {
		t.Fatal(drawn)
	}
	owned := false
	for _, c := range s.ControlCards {
		if c.Subject.ID == id && c.OwnerID == "p1" {
			owned = true
		}
	}
	if !owned {
		t.Fatal("lost control card")
	}
	if !AdvancePhase(other, otherGD).Accepted || Snapshot(other) != Snapshot(s) || s.RNG.Intn(10000) != other.RNG.Intn(10000) {
		t.Fatal("seeded recycling drift")
	}
	emptyGD, empty, _ := phaseCardGame(t, "electric-sheep")
	empty.Deck = nil
	empty.Discard = nil
	if !AdvancePhase(empty, emptyGD).Accepted || len(empty.Players[0].Hand) != 4 {
		t.Fatal("depleted piles")
	}
}

func TestPhaseInsiderTradingPhysicalDiscardsAndBenefit(t *testing.T) {
	gd, s, id := phaseCardGame(t, "insider-trading")
	if cardByID(gd, "insider-trading").Type != "add-on" || !slices.Equal(cardByID(gd, "insider-trading").Class, []string{"trade-secret"}) {
		t.Fatal("printed card classification lost")
	}
	_, hand := PlayerAttachmentModifiers(s, gd, "p1")
	if hand != 2 {
		t.Fatal(hand)
	}
	if !AdvancePhase(s, gd).Accepted || s.PendingChoice.Kind != "discard-cards" || s.PendingChoice.Amount != 2 {
		t.Fatal("missing choice")
	}
	before := Snapshot(s)
	rng := *s.RNG
	choiceID := s.PendingChoice.ID
	for _, ids := range [][]string{{}, {"dj"}, {"dj", "dj", "dj"}, {"dj", "missing"}, {"octagon-dex", "octagon-dex"}} {
		if ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: choiceID, OptionID: "discard", CardIDs: ids}).Accepted || Snapshot(s) != before {
			t.Fatal("invalid physical discard accepted")
		}
	}
	probe := *s.RNG
	if probe.Intn(1000) != rng.Intn(1000) {
		t.Fatal("rejection RNG")
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: choiceID, OptionID: "discard", CardIDs: []string{"dj", "dj"}})
	_, hand = PlayerAttachmentModifiers(s, gd, "p1")
	if !r.Accepted || !slices.Equal(s.Players[0].Hand, []string{"octagon-dex"}) || !slices.Equal(s.Discard, []string{"dj", "dj"}) || len(s.Cybernet.PawnByID(id).Attachments) != 1 || hand != 2 || s.Players[0].BonusCounters != 0 || len(s.Players[0].OncePerTurnUsed) != 0 || s.Phase != domain.PhaseAction {
		t.Fatal(r)
	}
}

func TestPhaseInsiderTradingShortfallSourceGap(t *testing.T) {
	gd, s, _ := phaseCardGame(t, "insider-trading")
	s.Players[0].Hand = []string{"dj"}
	before := Snapshot(s)
	rng := *s.RNG
	r := AdvancePhase(s, gd)
	if r.Accepted || !strings.Contains(r.Error, "shortfall interpretation is unresolved") || Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal(r)
	}
}

func TestPhaseJetpackDestinationsRefundAndGolden(t *testing.T) {
	gd, s, id := phaseCardGame(t, "jetpack")
	started := AdvancePhase(s, gd)
	if !started.Accepted || s.PendingChoice.Kind != "relocate-pawn" {
		t.Fatal(started)
	}
	if Snapshot(s) != readGolden(t, "phase-relocation.snap") {
		t.Fatal("pending relocation golden", Snapshot(s))
	}
	before := Snapshot(s)
	rng := *s.RNG
	choiceID := s.PendingChoice.ID
	options := AvailableActions(s, gd)
	free := false
	for _, target := range options[0].Targets {
		if target.Coord.Q == 8 && target.SpaceID == "free" {
			free = true
		}
		if target.Coord.Q == 8 && target.SpaceID == "occupied" {
			t.Fatal("occupied offered")
		}
	}
	if !free {
		t.Fatal("free missing")
	}
	options[0].Targets[0].Coord.Q = 999
	if Snapshot(s) != before {
		t.Fatal("preview mutated")
	}
	for _, a := range []Action{{Coord: &domain.Coord{Q: 8}, SpaceID: "occupied"}, {Coord: &domain.Coord{Q: 9}, SpaceID: "free"}, {Coord: &domain.Coord{Q: 8}, SpaceID: "missing"}, {Coord: &domain.Coord{Q: 8}, SpaceID: "free", CardIDs: []string{"dj"}}} {
		a.Type = ActResolveChoice
		a.ChoiceID = choiceID
		a.OptionID = "relocate"
		if ApplyWithEvents(s, gd, a).Accepted || Snapshot(s) != before {
			t.Fatal("invalid relocation accepted")
		}
	}
	resolved := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: choiceID, OptionID: "relocate", Coord: &domain.Coord{Q: 8}, SpaceID: "free"})
	pawn := s.Cybernet.PawnByID(id)
	if !resolved.Accepted || pawn.Coord.Q != 8 || len(pawn.Attachments) != 0 || !slices.Equal(s.Discard, []string{"jetpack"}) || s.Players[0].BonusCounters != 1 || s.Phase != domain.PhaseAction {
		t.Fatal(resolved)
	}
	var expected [][]EngineEvent
	if err := json.Unmarshal([]byte(readGolden(t, "phase-relocation.events.json")), &expected); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual([][]EngineEvent{started.Events, resolved.Events}, expected) || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal("event or RNG parity")
	}
}

func TestPhaseJetpackThreatInterpretationIsolated(t *testing.T) {
	gd, s, _ := phaseCardGame(t, "jetpack")
	s.Threats = []domain.ThreatOnBoard{{ID: "guard", ThreatID: "guard", Coord: domain.Coord{Q: 8}, SpaceID: "free", Status: "inactive"}}
	AdvancePhase(s, gd)
	before := Snapshot(s)
	rng := *s.RNG
	for _, target := range AvailableActions(s, gd)[0].Targets {
		if target.Coord.Q == 8 {
			t.Fatal("unresolved destination offered")
		}
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "relocate", Coord: &domain.Coord{Q: 8}, SpaceID: "free"})
	if r.Accepted || !strings.Contains(r.Error, "versus threats interpretation is unresolved") || Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal(r)
	}
}

func TestPhaseExplicitNormalMovementCombatResumption(t *testing.T) {
	for _, defeatsThreat := range []bool{false, true} {
		gd, s, id := phaseCardGame(t, "jetpack")
		// Synthetic effect contract: canonical Jetpack leaves the disputed threat reading unset.
		cardByID(gd, "jetpack").Attach.PhaseEffects[0].ThreatMode = "normal-movement"
		pawn, _ := gd.PawnByID(id)
		pawn.Abilities = append(pawn.Abilities, domain.Ability{Ability: "delete", Activation: "card", Skulls: 1})
		defense := []domain.DefenseDie{}
		for i := 1; i <= 6; i++ {
			defense = append(defense, domain.DefenseDie{Value: i, Shielded: !defeatsThreat})
		}
		gd.Threats = []domain.Threat{{ID: "test", Name: "Synthetic threat", Type: "token", AttackDie: 5, Defense: defense}}
		s.Threats = []domain.ThreatOnBoard{{ID: "test", ThreatID: "test", Coord: domain.Coord{Q: 8}, SpaceID: "free", Status: "inactive"}}
		s.Players[0].Hand = []string{"electric-sheep"}
		began := AdvancePhase(s, gd)
		moved := ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "relocate", Coord: &domain.Coord{Q: 8}, SpaceID: "free"})
		if !moved.Accepted || s.Phase != domain.PhaseBeginning || s.PendingPhase != "beginning" || !s.Players[0].OncePerTurnUsed["old"] {
			t.Fatal("phase did not pause")
		}
		before := Snapshot(s)
		rng := *s.RNG
		options := AvailableActions(s, gd)
		probe := *s.RNG
		if len(options) != 2 || options[0].Action.Type != ActAssignThreatAttack || options[1].Action.Type != ActRollDelete || Snapshot(s) != before || probe.Intn(1000) != rng.Intn(1000) {
			t.Fatal("preview")
		}
		if AdvancePhase(s, gd).Accepted || ApplyWithEvents(s, gd, Action{Type: ActPass}).Accepted || Snapshot(s) != before {
			t.Fatal("phase bypass")
		}
		rolled := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: "electric-sheep"})
		if !rolled.Accepted || !slices.Equal(s.PlayedCards, []string{"electric-sheep"}) {
			t.Fatal("phase combat payment")
		}
		if !defeatsThreat && Snapshot(s) != readGolden(t, "phase-combat.snap") {
			t.Fatal("phase combat snapshot parity", Snapshot(s))
		}
		assigned := ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{"test"}})
		if !assigned.Accepted {
			t.Fatal("assign")
		}
		if !defeatsThreat {
			if s.Phase != domain.PhaseBeginning || s.PendingThreats.Stage != "retaliation" {
				t.Fatal("retaliation")
			}
			attacked := ApplyWithEvents(s, gd, Action{Type: ActAssignThreatAttack, TargetIDs: []string{id}})
			if !attacked.Accepted || !slices.Contains(s.Eliminated, id) {
				t.Fatal(attacked)
			}
			var expected [][]EngineEvent
			if err := json.Unmarshal([]byte(readGolden(t, "phase-combat.events.json")), &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual([][]EngineEvent{began.Events, moved.Events, rolled.Events, assigned.Events, attacked.Events}, expected) {
				t.Fatal("phase combat ordered event parity")
			}
		}
		if s.Phase != domain.PhaseAction || s.PendingPhase != "" || s.PendingThreats != nil || len(s.Players[0].OncePerTurnUsed) != 0 || s.Threats[0].Status != "inactive" || !slices.Equal(s.PlayedCards, []string{"electric-sheep"}) {
			t.Fatal("bookkeeping failed")
		}
	}
}

func TestPhaseUnsupportedDefinitionsRejectAtConstruction(t *testing.T) {
	for _, effect := range []domain.PhaseEffect{{Trigger: "future", Kind: "discard-self"}, {Trigger: "begin-turn", Kind: "future"}, {Trigger: "begin-turn", Kind: "discard-cards", Amount: 0}, {Trigger: "begin-turn", Kind: "sacrifice-and-draw"}, {Trigger: "begin-turn", Kind: "discard-and-relocate", ThreatMode: "future"}} {
		gd, _, _ := phaseCardGame(t, "jetpack")
		cardByID(gd, "jetpack").Attach.PhaseEffects = []domain.PhaseEffect{effect}
		if _, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42, AllowProvisional: true}); err == nil {
			t.Fatal("unsupported effect silently accepted", effect)
		}
	}
}

func TestPhaseExplicitPlacementAndAcceptRetaliation(t *testing.T) {
	for _, mode := range []string{"placement", "normal-movement"} {
		gd, s, id := phaseCardGame(t, "jetpack")
		cardByID(gd, "jetpack").Attach.PhaseEffects[0].ThreatMode = mode
		gd.Threats = []domain.Threat{{ID: "test", Name: "Test", Type: "token", AttackDie: 5, Defense: []domain.DefenseDie{{Value: 1}}}}
		s.Threats = []domain.ThreatOnBoard{{ID: "test", ThreatID: "test", Coord: domain.Coord{Q: 8}, SpaceID: "free", Status: "inactive"}}
		rng := *s.RNG
		AdvancePhase(s, gd)
		if !ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "relocate", Coord: &domain.Coord{Q: 8}, SpaceID: "free"}).Accepted {
			t.Fatal("relocation")
		}
		if mode == "normal-movement" {
			options := AvailableActions(s, gd)
			if s.Phase != domain.PhaseBeginning || len(options) != 1 || options[0].Action.Type != ActAssignThreatAttack {
				t.Fatal("missing accept response")
			}
			if !ApplyWithEvents(s, gd, Action{Type: ActAssignThreatAttack, TargetIDs: []string{id}}).Accepted || !slices.Contains(s.Eliminated, id) {
				t.Fatal("retaliation")
			}
		} else if s.Cybernet.PawnByID(id) == nil || s.Threats[0].Status != "inactive" {
			t.Fatal("placement awakened threats")
		}
		if s.Phase != domain.PhaseAction || s.PendingPhase != "" || s.RNG.Intn(1000) != rng.Intn(1000) {
			t.Fatal("phase or RNG")
		}
	}
}

func TestPhasePrintedAttachmentCostsAndAtomicDuplicates(t *testing.T) {
	for _, c := range []struct {
		id   string
		cost int
	}{{"electric-sheep", 2}, {"jetpack", 1}, {"insider-trading", 1}, {"dummy", 1}} {
		gd, s, id := phaseCardGame(t, c.id)
		s.Phase = domain.PhaseAction
		s.Cybernet.PawnByID(id).Attachments = nil
		if cardByID(gd, c.id).Copies != 1 || cardByID(gd, c.id).Attach.Cost != c.cost {
			t.Fatal("printed copies or cost")
		}
		s.Players[0].Hand = []string{c.id}
		s.Players[0].BonusCounters = c.cost - 1
		a := Action{Type: ActAttachPawn, CardID: c.id, TargetID: id}
		before := Snapshot(s)
		rng := *s.RNG
		if ApplyWithEvents(s, gd, a).Accepted || Snapshot(s) != before {
			t.Fatal("unpaid attachment")
		}
		probe := *s.RNG
		if probe.Intn(1000) != rng.Intn(1000) {
			t.Fatal("failed cost changed RNG")
		}
		s.Players[0].BonusCounters = c.cost
		if !ApplyWithEvents(s, gd, a).Accepted || s.Players[0].BonusCounters != 0 || len(s.Players[0].Hand) != 0 || s.Cybernet.PawnByID(id).Attachments[0].BonusPaid != c.cost {
			t.Fatal("paid attachment")
		}
		s.Players[0].Hand = []string{c.id}
		s.Players[0].BonusCounters = c.cost
		occupied := Snapshot(s)
		if ApplyWithEvents(s, gd, a).Accepted || Snapshot(s) != occupied {
			t.Fatal("duplicate slot changed state")
		}
	}
}
