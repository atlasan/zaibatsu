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

func preventionGame(t *testing.T) (*domain.GameData, *domain.GameState, string, string) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-support", Name: "Synthetic support", Attach: &domain.Attach{As: "pawn", Slot: "gadget", Cost: 2, HandModifier: 1}})
	gd.ControlCards = append(gd.ControlCards, domain.ControlCard{ID: "cracker-test-control", Name: "Synthetic Cracker control", Expansion: domain.ExpSpeedrunners, Subject: domain.CardSubject{Kind: "pawn", ID: "cracker"}, Provisional: true})
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	attacker, victim := s.Players[0].PawnID, s.Players[1].PawnID
	actor, _ := gd.PawnByID(attacker)
	actor.Abilities = append(actor.Abilities, domain.Ability{Ability: "delete", Activation: "card", Skulls: 1})
	target, _ := gd.PawnByID(victim)
	target.Defense = allFacesDefense()
	s.Cybernet.PawnByID(victim).Attachments = []domain.Attachment{{CardID: "dummy", Slot: "add-on", BonusPaid: 1}, {CardID: "fixture-support", Slot: "gadget", BonusPaid: 2}}
	s.Players[0].Hand = []string{"electric-sheep", "electric-sheep"}
	return gd, s, attacker, victim
}
func assertPieceConservation(t *testing.T, s *domain.GameState, gd *domain.GameData) {
	t.Helper()
	pieces := append([]string{}, s.Eliminated...)
	pieces = append(pieces, s.Reserve...)
	pieces = append(pieces, s.OutOfGame...)
	for _, p := range s.Cybernet.Pawns {
		pieces = append(pieces, p.PawnID)
	}
	seen := map[string]bool{}
	for _, id := range pieces {
		if seen[id] {
			t.Fatal("duplicate piece", id)
		}
		seen[id] = true
	}
	expected := []string{}
	for _, p := range gd.Pawns {
		expected = append(expected, p.ID)
	}
	slices.Sort(pieces)
	slices.Sort(expected)
	if !slices.Equal(pieces, expected) {
		t.Fatal("physical piece conservation", pieces, expected)
	}
}
func preventionPublicHit(t *testing.T, s *domain.GameState, gd *domain.GameData, attacker, victim string) [][]EngineEvent {
	t.Helper()
	rolled := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: attacker, CardID: "electric-sheep"})
	if !rolled.Accepted {
		t.Fatal(rolled)
	}
	assigned := ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{victim}})
	if !assigned.Accepted {
		t.Fatal(assigned)
	}
	return [][]EngineEvent{rolled.Events, assigned.Events}
}
func pawnCardOwner(s *domain.GameState, id string) string {
	for _, c := range s.ControlCards {
		if c.Subject.Kind == "pawn" && c.Subject.ID == id {
			return c.OwnerID
		}
	}
	return "missing"
}

func TestPreventionDefenderChoiceOutsideActiveTurn(t *testing.T) {
	gd, s, attacker, victim := preventionGame(t)
	events := preventionPublicHit(t, s, gd, attacker, victim)
	if s.CurrentPlayer != 0 || s.PendingChoice == nil || s.PendingChoice.PlayerID != "p2" || s.PendingChoice.Kind != "prevent-elimination" || s.PendingEliminations[0].Cause != "attack" || len(s.Cybernet.PawnByID(victim).Attachments) != 2 || s.Players[1].BonusCounters != 0 {
		t.Fatal("replacement did not hold cleanup")
	}
	if Snapshot(s) != readGolden(t, "prevention.snap") {
		t.Fatal("pending prevention snapshot parity", Snapshot(s))
	}
	before := Snapshot(s)
	rng := *s.RNG
	choiceID := s.PendingChoice.ID
	options := AvailableActions(s, gd)
	expected := []Action{{Type: ActResolveChoice, ChoiceID: choiceID, PlayerID: "p2", OptionID: "prevent", CardID: "dummy"}, {Type: ActResolveChoice, ChoiceID: choiceID, PlayerID: "p2", OptionID: "allow"}}
	if !reflect.DeepEqual(options[0].Responses, expected) || Snapshot(s) != before {
		t.Fatal("response query")
	}
	copy := CloneState(s)
	copy.PendingEliminations[0].Cause = "sacrifice"
	copy.PendingChoice.CardIDs[0] = "changed"
	copy.Reserve = copy.Reserve[:len(copy.Reserve)-1]
	if Snapshot(s) != before {
		t.Fatal("clone shares decisions or pools")
	}
	for _, a := range []Action{{Type: ActPass}, {Type: ActResolveChoice, ChoiceID: choiceID, OptionID: "prevent", CardID: "dummy"}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: "old", OptionID: "prevent", CardID: "dummy"}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: choiceID, OptionID: "prevent", CardID: "electric-sheep"}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: choiceID, OptionID: "prevent", CardID: "dummy", CardIDs: []string{"dj"}}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: choiceID, OptionID: "allow", CardID: "dummy"}, {Type: ActResolveChoice, PlayerID: "p2", ChoiceID: choiceID, OptionID: "prevent", CardID: "dummy", ExtraSkulls: 3}} {
		if ApplyWithEvents(s, gd, a).Accepted || Snapshot(s) != before {
			t.Fatal("invalid response changed state", a)
		}
	}
	if AdvancePhase(s, gd).Accepted {
		t.Fatal("skipped pending decision")
	}
	probe := *s.RNG
	if probe.Intn(1000) != rng.Intn(1000) {
		t.Fatal("rejection advanced RNG")
	}
	saved := ApplyWithEvents(s, gd, options[0].Responses[0])
	if !saved.Accepted {
		t.Fatal(saved)
	}
	events = append(events, saved.Events)
	atts := s.Cybernet.PawnByID(victim).Attachments
	_, hand := PlayerAttachmentModifiers(s, gd, "p2")
	if len(atts) != 1 || atts[0].CardID != "fixture-support" || hand != 1 || s.Players[1].BonusCounters != 1 || !slices.Equal(s.Discard, []string{"dummy"}) || !slices.Equal(s.PlayedCards, []string{"electric-sheep"}) || !slices.Equal(s.Players[0].Hand, []string{"electric-sheep"}) || s.PendingChoice != nil || len(s.PendingEliminations) > 0 || slices.Contains(s.Eliminated, victim) {
		t.Fatal("prevention cleanup or refund")
	}
	assertPieceConservation(t, s, gd)
	rolled := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: attacker, CardID: "electric-sheep"})
	killed := ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{victim}})
	if !killed.Accepted {
		t.Fatal(killed)
	}
	events = append(events, rolled.Events, killed.Events)
	if s.PendingChoice != nil || !slices.Contains(s.Eliminated, victim) || s.Players[1].BonusCounters != 3 || !slices.Equal(s.Discard, []string{"dummy", "fixture-support"}) || pawnCardOwner(s, victim) != "p2" {
		t.Fatal("second attack reused protection")
	}
	var expectedEvents [][]EngineEvent
	if err := json.Unmarshal([]byte(readGolden(t, "prevention.events.json")), &expectedEvents); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(events, expectedEvents) {
		t.Fatal("ordered prevention events parity", events)
	}
	if ApplyWithEvents(s, gd, options[0].Responses[0]).Accepted {
		t.Fatal("stale prevention reused")
	}
	assertPieceConservation(t, s, gd)
}

func TestPreventionDeclineRebootVersusReserve(t *testing.T) {
	for _, reboot := range []bool{true, false} {
		gd, s, attacker, victim := preventionGame(t)
		if !reboot {
			def, _ := gd.PawnByID(victim)
			abilities := []domain.Ability{}
			for _, a := range def.Abilities {
				if a.Ability != "reboot" {
					abilities = append(abilities, a)
				}
			}
			def.Abilities = abilities
		}
		preventionPublicHit(t, s, gd, attacker, victim)
		options := AvailableActions(s, gd)
		r := ApplyWithEvents(s, gd, options[0].Responses[len(options[0].Responses)-1])
		if !r.Accepted || s.Cybernet.PawnByID(victim) != nil || s.Players[1].BonusCounters != 3 || slices.Contains(s.Eliminated, victim) != reboot || slices.Contains(s.Reserve, victim) == reboot {
			t.Fatal("cleanup fate", r)
		}
		owner := ""
		if reboot {
			owner = "p2"
		}
		zone := "common"
		if reboot {
			zone = "control"
		}
		for _, card := range s.ControlCards {
			if card.Subject.ID == victim && card.Zone != zone {
				t.Fatal("wrong physical card zone", card)
			}
		}
		if pawnCardOwner(s, victim) != owner {
			t.Fatal("physical card ownership")
		}
		if !reboot {
			released := false
			for _, e := range r.Events {
				if e.Type == "control-card-released" && e.PawnID == victim {
					released = true
				}
			}
			if !released {
				t.Fatal("missing release event")
			}
		}
		assertPieceConservation(t, s, gd)
	}
}

func TestLifecycleReservePlacementAndCommonCard(t *testing.T) {
	gd, s, attacker, _ := preventionGame(t)
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "fixture-lifecycle", Name: "Synthetic lifecycle board", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceHigh, IceFaces: []int{1, 2, 3, 4, 5, 6}, Spaces: []domain.Space{{ID: "core", Type: "special", Capacity: domain.UnlimitedCapacity}}})
	s.Cybernet.Blocks[0].BlockID = "fixture-lifecycle"
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-placement", Name: "Synthetic placement", Activates: []string{"icebreaker"}, Effects: []domain.CardEffect{{Kind: "place-pawn", Target: "cracker", Trigger: "on-icebreak"}}})
	s.Players[0].Hand = []string{"fixture-placement"}
	if !slices.Contains(s.Reserve, "cracker") || !ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakBlk, PawnID: attacker, CardID: "fixture-placement", Coord: &domain.Coord{}}).Accepted || slices.Contains(s.Reserve, "cracker") || s.Cybernet.PawnByID("cracker").OwnerID != "p1" || pawnCardOwner(s, "cracker") != "p1" {
		t.Fatal("reserve piece placement")
	}
	assertPieceConservation(t, s, gd)
	s.Cybernet.PawnByID("cracker").Attachments = []domain.Attachment{{CardID: "fixture-support", Slot: "gadget", BonusPaid: 2}}
	if !eliminatePawn(s, "cracker", gd) || !slices.Contains(s.Reserve, "cracker") || slices.Contains(s.Eliminated, "cracker") || s.Players[0].BonusCounters != 2 || pawnCardOwner(s, "cracker") != "" {
		t.Fatal("reserve return")
	}
	assertPieceConservation(t, s, gd)
	before := Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActPlayReboot, PawnID: "cracker", CardIDs: []string{"dj", "dj", "dj", "dj"}}).Accepted || Snapshot(s) != before {
		t.Fatal("rebooted reserve piece")
	}
	historical, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	regression, err := NewGame(Config{Data: historical, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || regression.RulesVersion != "" || regression.Reserve != nil {
		t.Fatal("historical fixture changed", err)
	}
}

func TestPreventionBlackICEReplacement(t *testing.T) {
	gd, s, attacker, victim := preventionGame(t)
	s.Cybernet.PawnByID(victim).Attachments = nil
	s.Cybernet.PawnByID(attacker).Attachments = []domain.Attachment{{CardID: "dummy", Slot: "add-on", BonusPaid: 1}}
	def, _ := gd.PawnByID(attacker)
	def.IcebreakerModifier = &domain.IcebreakerModifier{}
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "fixture-black", Name: "Synthetic Black ICE", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceBlack, IceFaces: []int{6}, Spaces: []domain.Space{{ID: "core", Type: "special", Capacity: domain.UnlimitedCapacity}}})
	s.Cybernet.Blocks[0].BlockID = "fixture-black"
	s.Players[0].Hand = []string{"dj"}
	s.RNG = domain.NewRNG(79)
	result := ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakBlk, PawnID: attacker, CardID: "dj", Coord: &domain.Coord{}})
	if !result.Accepted || len(s.PendingEliminations) != 1 || s.PendingEliminations[0].Cause != "black-ice" || s.PendingChoice.PlayerID != "p1" || !slices.Equal(s.PlayedCards, []string{"dj"}) {
		t.Fatal(result)
	}
	if !ApplyWithEvents(s, gd, AvailableActions(s, gd)[0].Responses[0]).Accepted || s.Cybernet.PawnByID(attacker) == nil || s.Players[0].BonusCounters != 1 {
		t.Fatal("black ICE protection")
	}
}

func TestPreventionAreaAndSimultaneousWindowRollback(t *testing.T) {
	for _, two := range []bool{false, true} {
		gd, s, attacker, victim := preventionGame(t)
		def, _ := gd.PawnByID(attacker)
		def.Class = []string{"bomb"}
		def.Defense = allFacesDefense()
		if two {
			gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-second-guard", Name: "Synthetic guard", Attach: &domain.Attach{As: "pawn", Slot: "add-on", EliminationPrevention: &domain.EliminationPrevention{Kind: "discard-self"}}})
			s.Cybernet.PawnByID(attacker).Attachments = []domain.Attachment{{CardID: "fixture-second-guard", Slot: "add-on"}}
		}
		a := Action{Type: ActPlayDeleteArea, PawnID: attacker, CardID: "electric-sheep"}
		before := Snapshot(s)
		rng := *s.RNG
		r := ApplyWithEvents(s, gd, a)
		if two {
			probe := *s.RNG
			if r.Accepted || !strings.Contains(r.Error, "simultaneous elimination-prevention ordering is unresolved") || Snapshot(s) != before || probe.Intn(1000) != rng.Intn(1000) {
				t.Fatal(r)
			}
			if err := Apply(s, gd, a); err == nil || !strings.Contains(err.Error(), "ordering is unresolved") || Snapshot(s) != before {
				t.Fatal("compatibility reducer rollback", err)
			}
		} else if !r.Accepted || !slices.Contains(s.Eliminated, attacker) || s.PendingChoice.PawnID != victim || !ApplyWithEvents(s, gd, AvailableActions(s, gd)[0].Responses[0]).Accepted || s.Cybernet.PawnByID(victim) == nil {
			t.Fatal("area replacement", r)
		}
	}
}

func TestPreventionSacrificeGapRollback(t *testing.T) {
	gd, s, attacker, _ := preventionGame(t)
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-sacrifice", Name: "Synthetic sacrifice", Attach: &domain.Attach{As: "pawn", Slot: "gadget", PhaseEffects: []domain.PhaseEffect{{Trigger: "begin-turn", Kind: "sacrifice-and-draw", Amount: 3}}}})
	s.Cybernet.PawnByID(attacker).Attachments = []domain.Attachment{{CardID: "dummy", Slot: "add-on", BonusPaid: 1}, {CardID: "fixture-sacrifice", Slot: "gadget"}}
	s.Phase = domain.PhaseBeginning
	before := Snapshot(s)
	rng := *s.RNG
	r := AdvancePhase(s, gd)
	if r.Accepted || !strings.Contains(r.Error, "sacrifice versus elimination prevention is unresolved") || Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal(r)
	}
}

func TestPreventionBeginningRetaliationResumesAfterChoice(t *testing.T) {
	gd, s, attacker, victim := preventionGame(t)
	s.Cybernet.PawnByID(victim).Attachments = nil
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-phase-jump", Name: "Synthetic phase jump", Attach: &domain.Attach{As: "pawn", Slot: "gadget", PhaseEffects: []domain.PhaseEffect{{Trigger: "begin-turn", Kind: "discard-and-relocate", ThreatMode: "normal-movement"}}}})
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "fixture-threat", Name: "Synthetic threat board", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceNone, Spaces: []domain.Space{{ID: "free", Type: "special", Capacity: domain.UnlimitedCapacity}}})
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "fixture-threat", Coord: domain.Coord{Q: 8}})
	gd.Threats = []domain.Threat{{ID: "test", Name: "Synthetic fixed attack", Type: "token", AttackDie: 5, Defense: []domain.DefenseDie{{Value: 1}}}}
	s.Threats = []domain.ThreatOnBoard{{ID: "test", ThreatID: "test", Coord: domain.Coord{Q: 8}, SpaceID: "free", Status: "inactive"}}
	def, _ := gd.PawnByID(attacker)
	def.Defense = allFacesDefense()
	s.Cybernet.PawnByID(attacker).Attachments = []domain.Attachment{{CardID: "dummy", Slot: "add-on", BonusPaid: 1}, {CardID: "fixture-phase-jump", Slot: "gadget"}}
	s.Players[0].Hand = nil
	s.Players[0].OncePerTurnUsed = map[string]bool{"old": true}
	s.Phase = domain.PhaseBeginning
	rng := *s.RNG
	if !AdvancePhase(s, gd).Accepted || !ApplyWithEvents(s, gd, Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "relocate", Coord: &domain.Coord{Q: 8}, SpaceID: "free"}).Accepted || !ApplyWithEvents(s, gd, Action{Type: ActAssignThreatAttack, TargetIDs: []string{attacker}}).Accepted {
		t.Fatal("phase/threat setup")
	}
	if s.PendingChoice.Kind != "prevent-elimination" || s.Phase != domain.PhaseBeginning || !s.Players[0].OncePerTurnUsed["old"] {
		t.Fatal("beginning reset before prevention")
	}
	before := Snapshot(s)
	if AdvancePhase(s, gd).Accepted || Snapshot(s) != before {
		t.Fatal("skipped replacement")
	}
	if !ApplyWithEvents(s, gd, AvailableActions(s, gd)[0].Responses[0]).Accepted || s.Phase != domain.PhaseAction || s.PendingPhase != "" || s.PendingChoice != nil || len(s.PendingEliminations) != 0 || s.Cybernet.PawnByID(attacker) == nil || len(s.Players[0].OncePerTurnUsed) != 0 || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal("resumption after prevention")
	}
	assertPieceConservation(t, s, gd)
}

func TestPreventionUnsupportedHandlerRejected(t *testing.T) {
	gd, _, _, _ := preventionGame(t)
	cardByID(gd, "dummy").Attach.EliminationPrevention.Kind = "unknown-handler"
	if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "unsupported elimination prevention handler") {
		t.Fatal("unsupported replacement accepted", err)
	}
}

func TestSourceCompatibilityEntryEnforcesLiveAuthority(t *testing.T) {
	gd, s, _, _ := preventionGame(t)
	s.Phase = domain.PhaseBeginning
	before := Snapshot(s)
	rng := *s.RNG
	if err := Apply(s, gd, Action{Type: ActPass}); err == nil || !strings.Contains(err.Error(), "action phase") || Snapshot(s) != before {
		t.Fatal("phase bypass", err)
	}
	s.Phase = domain.PhaseAction
	active := Snapshot(s)
	if err := Apply(s, gd, Action{Type: ActPass, PlayerID: "p2"}); err == nil || !strings.Contains(err.Error(), "active player") || Snapshot(s) != active || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal("authority bypass", err)
	}
}
