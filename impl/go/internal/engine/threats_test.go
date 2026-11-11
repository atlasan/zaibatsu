package engine

import (
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMatchingRebootCard(t *testing.T) {
	gd, s, _ := battleFixture(t)
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "test-reboot", Name: "Test Reboot", Activates: []string{"reboot"}})
	id := s.Players[1].PawnID
	p, _ := gd.PawnByID(id)
	p.Abilities = []domain.Ability{{Ability: "reboot", Activation: "card"}}
	s.Cybernet.RemovePawn(id)
	s.Eliminated = []string{id}
	s.Players[0].Hand = []string{"test-reboot"}
	r := ApplyWithEvents(s, gd, Action{Type: ActPlayRebootCard, PawnID: id, CardID: "test-reboot"})
	if !r.Accepted || s.Cybernet.PawnByID(id).OwnerID != "p1" || len(s.PlayedCards) != 1 || s.PlayedCards[0] != "test-reboot" || len(s.Discard) != 0 {
		t.Fatalf("matching Reboot failed: %+v", r)
	}
}

func TestStealthAvoidsThreatActivation(t *testing.T) {
	gd, s, id := battleFixture(t)
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "stealth", Name: "Stealth", Attach: &domain.Attach{As: "pawn", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 3, Stealth: true}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Activation: "once-per-turn"}}}})
	s.Cybernet.PawnByID(id).Attachments = []domain.Attachment{{CardID: "stealth"}}
	r := ApplyWithEvents(s, gd, Action{Type: ActMoveSteps, PawnID: id, MovementIndex: 1, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}, {Coord: domain.Coord{}, SpaceID: "a"}}})
	if !r.Accepted || s.Threats[0].Status != "inactive" || s.PendingThreats != nil {
		t.Fatalf("stealth failed: %+v", r)
	}
}
func TestJointAttackModifiers(t *testing.T) {
	gd, s, id := battleFixture(t)
	other := s.Players[1].PawnID
	s.Cybernet.PawnByID(other).OwnerID = "p1"
	p, _ := gd.PawnByID(other)
	p.Abilities = []domain.Ability{{Ability: "delete", Activation: "card", Skulls: 1}}
	core, _ := gd.CentralCore()
	core.Spaces[0].Modifier = &domain.SpaceModifier{Kind: "attack", Amount: 1}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "weapon", Name: "Weapon", Attach: &domain.Attach{As: "pawn", AttackModifier: 2}})
	s.Cybernet.PawnByID(id).Attachments = []domain.Attachment{{CardID: "weapon"}}
	r := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: "move-2", Joint: true})
	if !r.Accepted || len(s.PendingAttack.Roll) != 7 || len(s.PendingAttack.AttackerIDs) != 2 || len(s.Players[0].Hand) != 2 {
		t.Fatalf("joint attack failed: %+v", r)
	}
}
func TestDeployThreatEventsAndModeCount(t *testing.T) {
	gd, _, _ := battleFixture(t)
	gd.Threats[0].Copies = 4
	core, _ := gd.CentralCore()
	for i := range core.Spaces {
		core.Spaces[i].Type = "event"
	}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 4})
	if err != nil || len(s.Threats) != 2 || len(s.ThreatPile) != 2 {
		t.Fatal("event deployment failed", err)
	}
	if err = DeployThreats(s, gd, domain.Coord{}); err != nil || len(s.Threats) != 2 || len(s.ThreatPile) != 2 {
		t.Fatal("duplicate event deployment", err)
	}
	gd.Mode.AllowedPlayerCounts = []int{2, 4}
	if _, err = NewGame(Config{Data: gd, PlayerNames: []string{"A", "B", "C"}, Seed: 4}); err == nil {
		t.Fatal("odd teams accepted")
	}
}

func battleFixture(t *testing.T) (*domain.GameData, *domain.GameState, string) {
	t.Helper()
	gd := loadOrSkip(t)
	core, _ := gd.CentralCore()
	core.Spaces = []domain.Space{{ID: "a", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"b"}}, {ID: "b", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"a"}}}
	defense := []domain.DefenseDie{}
	for i := 1; i <= 6; i++ {
		defense = append(defense, domain.DefenseDie{Value: i})
	}
	gd.Threats = []domain.Threat{{ID: "test-token", Name: "Test token", Type: "token", AttackDie: 5, Defense: defense}}
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 101})
	if err != nil {
		t.Fatal(err)
	}
	AdvancePhase(s, gd)
	id := s.Players[0].PawnID
	p, _ := gd.PawnByID(id)
	p.Movement = domain.Movement{Type: "steps", Steps: 3, Activation: "once-per-turn"}
	p.Abilities = []domain.Ability{{Ability: "delete", Activation: "card", Skulls: 2}}
	s.Players[0].Hand = []string{"move-2", "move-2", "move-1"}
	s.Threats = []domain.ThreatOnBoard{{ID: "t1", ThreatID: "test-token", Coord: domain.Coord{}, SpaceID: "b", Status: "inactive"}}
	return gd, s, id
}
func TestThreatResponsePublicRoll(t *testing.T) {
	gd, s, id := battleFixture(t)
	before := Snapshot(s)
	bad := Action{Type: ActMoveSteps, PawnID: id, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}, {Coord: domain.Coord{}, SpaceID: "a"}}}
	if ApplyWithEvents(s, gd, bad).Accepted || Snapshot(s) != before {
		t.Fatal("movement failed to stop atomically")
	}
	bad.Path = bad.Path[:1]
	if !ApplyWithEvents(s, gd, bad).Accepted {
		t.Fatal("move rejected")
	}
	if s.PendingThreats == nil || s.PendingThreats.Stage != "response" || AdvancePhase(s, gd).Accepted {
		t.Fatal("response window missing")
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActRollDelete, PawnID: id, CardID: "move-2"})
	if !r.Accepted || s.PendingAttack == nil || len(s.PendingAttack.Roll) != 2 || len(s.PlayedCards) != 1 || len(s.Players[0].Hand) != 2 {
		t.Fatalf("paid public roll failed: %+v", r)
	}
	sd, err := data.FindSpecDir()
	if err != nil {
		t.Fatal(err)
	}
	golden, err := os.ReadFile(filepath.Join(sd, "..", "..", "golden", "threat-combat.snap"))
	if err != nil || Snapshot(s) != strings.TrimSpace(string(golden)) {
		t.Fatal("threat snapshot mismatch", err)
	}
	copy := CloneState(s)
	copy.PendingAttack.Roll[0] = 99
	if s.PendingAttack.Roll[0] == 99 {
		t.Fatal("clone shares roll")
	}
	before = Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{"missing", "t1"}}).Accepted || Snapshot(s) != before {
		t.Fatal("invalid assignment mutated roll")
	}
	if !ApplyWithEvents(s, gd, Action{Type: ActAssignDelete, TargetIDs: []string{"t1", "t1"}}).Accepted || s.Threats[0].Status != "eliminated" || s.PendingThreats != nil {
		t.Fatal("known dice did not defeat token")
	}
	if !ApplyWithEvents(s, gd, Action{Type: ActCollectThreat, PawnID: id, TargetID: "t1"}).Accepted || s.Players[0].BonusCounters != 1 || len(s.Threats) != 0 {
		t.Fatal("collection failed")
	}
	if len(s.ClearedEvents) != 1 || s.ClearedEvents[0] != "0,0:b" {
		t.Fatal("event not cleared")
	}
	core, _ := gd.CentralCore()
	core.Spaces[1].Type = "event"
	s.ThreatPile = []string{"test-token"}
	if err := DeployThreats(s, gd, domain.Coord{}); err != nil || len(s.Threats) != 0 || len(s.ThreatPile) != 1 {
		t.Fatal("collected event respawned", err)
	}
}
func TestThreatRetaliationPriorityAndReset(t *testing.T) {
	gd, s, id := battleFixture(t)
	ApplyWithEvents(s, gd, Action{Type: ActMoveSteps, PawnID: id, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}})
	before := Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActAssignThreatAttack, TargetIDs: []string{s.Players[1].PawnID}}).Accepted || Snapshot(s) != before {
		t.Fatal("priority not enforced")
	}
	p, _ := gd.PawnByID(id)
	for i := range p.Defense {
		p.Defense[i].Shielded = false
	}
	r := ApplyWithEvents(s, gd, Action{Type: ActAssignThreatAttack, TargetIDs: []string{id}})
	if !r.Accepted || !abilityListHas(s.Eliminated, id) {
		t.Fatal("fixed attack failed")
	}
	found := false
	for _, e := range r.Events {
		if e.Type == EventRoll && len(e.Roll) == 1 && e.Roll[0] == 5 {
			found = true
		}
	}
	if !found {
		t.Fatal("fixed face absent")
	}
	s.Threats[0].Status = "eliminated"
	s.Phase = domain.PhaseBeginning
	AdvancePhase(s, gd)
	if s.Threats[0].Status != "inactive" {
		t.Fatal("next turn did not reset threat")
	}
}
func TestRecyclePhysicalCopiesAndRelease(t *testing.T) {
	gd, s, _ := battleFixture(t)
	s.Phase = domain.PhaseRecycle
	s.Deck = []string{}
	s.Discard = []string{}
	s.PlayedCards = []string{"move-3"}
	before := Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActRecycle, CardIDs: []string{"move-2", "move-2", "move-2"}}).Accepted || Snapshot(s) != before {
		t.Fatal("invalid physical selection mutated state")
	}
	if !ApplyWithEvents(s, gd, Action{Type: ActRecycle, CardIDs: []string{"move-2"}}).Accepted || s.Phase != domain.PhaseEnd || len(s.PlayedCards) != 0 || len(s.Players[0].Hand) != 4 {
		t.Fatal("recycle failed")
	}
	counts := map[string]int{}
	for _, id := range s.Players[0].Hand {
		counts[id]++
	}
	if counts["move-2"] != 2 || counts["move-1"] != 1 || counts["move-3"] != 1 {
		t.Fatal(counts)
	}
}
