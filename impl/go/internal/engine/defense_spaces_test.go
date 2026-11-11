package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func defenseSpaceFixture(t *testing.T, regression ...bool) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if len(regression) > 0 && regression[0] {
		gd, err = data.LoadRegression("speedrunners")
	}
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	s.RNG = domain.NewRNG(79)
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "fixture-defense-board", Name: "Synthetic defense board", Expansion: domain.ExpSpeedrunners, Edges: []bool{true, true, true, true, true, true}, BoundarySpaces: [][]string{{"plain"}, {"plain"}, {"plain"}, {"plain"}, {"plain"}, {"plain"}}, Spaces: []domain.Space{{ID: "plain", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"shield", "weak"}}, {ID: "shield", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"plain"}, Modifier: &domain.SpaceModifier{Kind: "defense", Dice: []domain.DefenseDie{{Value: 3, Shielded: true}}}}, {ID: "weak", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"plain"}, Modifier: &domain.SpaceModifier{Kind: "defense", Dice: []domain.DefenseDie{{Value: 1}, {Value: 2}}}}}, Provisional: true})
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "fixture-defense-board", Coord: domain.Coord{Q: 1}})
	for _, p := range s.Cybernet.Pawns {
		p.Coord = domain.Coord{Q: 1}
		p.SpaceID = "weak"
		if p.PawnID == f.actor {
			p.SpaceID = "plain"
		}
	}
	a, _ := gd.PawnByID(f.actor)
	a.Class = []string{"bomb"}
	a.Abilities = []domain.Ability{{Ability: "delete", Activation: "once-per-turn", Skulls: 1}}
	target, _ := gd.PawnByID(f.target)
	target.Defense = nil
	for i := 1; i <= 6; i++ {
		target.Defense = append(target.Defense, domain.DefenseDie{Value: i, Shielded: i <= 2})
	}
	return f
}
func mustDefenseProfile(t *testing.T, f malwareFixture, pawnID string) []domain.DefenseDie {
	t.Helper()
	p, err := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID(pawnID))
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func TestDefenseSpacesPrintedExamplesArmorAndPureProfiles(t *testing.T) {
	f := defenseSpaceFixture(t)
	pawn := f.s.Cybernet.PawnByID(f.target)
	before, _ := json.Marshal(f.gd)
	profiles := []map[string]any{}
	shielded := [][]int{}
	for _, space := range []string{"plain", "shield", "weak"} {
		pawn.SpaceID = space
		dice := mustDefenseProfile(t, f, f.target)
		profiles = append(profiles, map[string]any{"space": space, "dice": dice})
		faces := []int{}
		for _, d := range dice {
			if d.Shielded {
				faces = append(faces, d.Value)
			}
		}
		shielded = append(shielded, faces)
	}
	if !reflect.DeepEqual(shielded, [][]int{{1, 2}, {1, 2, 3}, {}}) {
		t.Fatal(shielded)
	}
	after, _ := json.Marshal(f.gd)
	if string(before) != string(after) {
		t.Fatal("profile mutated data")
	}
	armor := []domain.DefenseDie{}
	for i := 1; i <= 6; i++ {
		armor = append(armor, domain.DefenseDie{Value: i, Shielded: true})
	}
	f.gd.Cards = append(f.gd.Cards, domain.ActionCard{ID: "fixture-defense-armor", Name: "Synthetic armor", Attach: &domain.Attach{As: "pawn", Slot: "armor", DefenseOverride: armor}})
	pawn.Attachments = []domain.Attachment{{CardID: "fixture-defense-armor", Slot: "armor", SlotRef: "pawn:armor"}}
	for _, space := range []string{"weak", "plain"} {
		pawn.SpaceID = space
		profiles = append(profiles, map[string]any{"space": "armor:" + space, "dice": mustDefenseProfile(t, f, f.target)})
	}
	raw, _ := json.Marshal(profiles)
	var got any
	var golden map[string]any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "defense-spaces.json")), &golden)
	if !reflect.DeepEqual(got, golden["profiles"]) {
		t.Fatal("defense shared profile mismatch", string(raw))
	}
	state := Snapshot(f.s)
	before, _ = json.Marshal(f.gd)
	rng := *f.s.RNG
	copy := mustDefenseProfile(t, f, f.target)
	copy[0].Shielded = false
	AvailableActions(f.s, f.gd)
	after, _ = json.Marshal(f.gd)
	actual := *f.s.RNG
	if Snapshot(f.s) != state || string(before) != string(after) || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("query/profile mutated state or RNG")
	}
	for _, d := range EffectiveDefenseDice(f.gd, pawn) {
		if !d.Shielded {
			t.Fatal("armor changed")
		}
	}
}
func TestDefenseSpacesAllDeleteRoutesUseCurrentShielding(t *testing.T) {
	for _, kind := range []ActionType{ActDelete, ActDeleteMulti, ActDeleteArea, ActRollDelete} {
		f := defenseSpaceFixture(t)
		a := Action{Type: kind, PawnID: f.actor}
		if kind == ActDelete {
			a.TargetID = f.target
		}
		if kind == ActDeleteMulti {
			a.TargetIDs = []string{f.target}
		}
		useMarkerCommand(t, f, a)
		if kind == ActRollDelete {
			if !reflect.DeepEqual(f.s.PendingAttack.Roll, []int{1}) {
				t.Fatal(f.s.PendingAttack)
			}
			useMarkerCommand(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
		}
		if f.s.Cybernet.PawnByID(f.target) != nil || !slices.Contains(f.s.Eliminated, f.target) {
			t.Fatal("space defense ignored", kind)
		}
	}
	f := defenseSpaceFixture(t)
	f.s.Cybernet.PawnByID(f.target).SpaceID = "plain"
	useMarkerCommand(t, f, Action{Type: ActDelete, PawnID: f.actor, TargetID: f.target})
	if f.s.Cybernet.PawnByID(f.target) == nil {
		t.Fatal("shielding persisted after leaving modifier")
	}
}
func TestDefenseSpacesThreatRetaliationAndPureRNG(t *testing.T) {
	f := defenseSpaceFixture(t)
	for _, id := range []string{f.actor, f.target} {
		p, _ := f.gd.PawnByID(id)
		p.Defense = nil
		for i := 1; i <= 6; i++ {
			p.Defense = append(p.Defense, domain.DefenseDie{Value: i, Shielded: true})
		}
	}
	b, _ := f.gd.BlockByID("fixture-defense-board")
	b.Spaces[2].Modifier = &domain.SpaceModifier{Kind: "defense", Dice: []domain.DefenseDie{{Value: 4}}}
	f.gd.Threats = []domain.Threat{{ID: "fixture-defense-threat", Name: "Synthetic fixed attack", Type: "drone", Copies: 2, AttackDie: 4, Defense: []domain.DefenseDie{{Value: 6}}}}
	f.s.Threats = []domain.ThreatOnBoard{{ID: "fixture-threat-0", ThreatID: "fixture-defense-threat", Coord: domain.Coord{Q: 1}, SpaceID: "plain", Status: "active"}, {ID: "fixture-threat-1", ThreatID: "fixture-defense-threat", Coord: domain.Coord{Q: 1}, SpaceID: "plain", Status: "active"}}
	f.s.PendingThreats = &domain.PendingThreatCombat{Coord: domain.Coord{Q: 1}, AttackerIDs: []string{f.actor}, Stage: "retaliation"}
	rng := *f.s.RNG
	useMarkerCommand(t, f, Action{Type: ActAssignThreatAttack, TargetIDs: []string{f.actor, f.target}})
	actual := *f.s.RNG
	if f.s.Cybernet.PawnByID(f.target) != nil || f.s.Cybernet.PawnByID(f.actor) == nil || actual.Intn(100000) != rng.Intn(100000) {
		t.Fatal("fixed threat did not use effective defense")
	}
}
func TestDefenseSpacesUnsupportedAndMalformedRejectAtomically(t *testing.T) {
	for _, kind := range []string{"numeric", "duplicate", "wrong-kind", "out-of-range"} {
		f := defenseSpaceFixture(t)
		b, _ := f.gd.BlockByID("fixture-defense-board")
		sp := &b.Spaces[2]
		switch kind {
		case "numeric":
			sp.Modifier = &domain.SpaceModifier{Kind: "defense", Amount: 1}
		case "duplicate":
			sp.Modifier.Dice = append(sp.Modifier.Dice, domain.DefenseDie{Value: 1, Shielded: true})
		case "wrong-kind":
			sp.Modifier.Kind = "ice"
		case "out-of-range":
			sp.Modifier.Dice[0].Value = 7
		}
		if _, err := DefenseProfile(f.s, f.gd, f.s.Cybernet.PawnByID(f.target)); err == nil {
			t.Fatal("malformed profile accepted")
		}
		rejectMovement(t, f, Action{Type: ActDelete, PawnID: f.actor, TargetID: f.target})
		useMarkerCommand(t, f, Action{Type: ActRollDelete, PawnID: f.actor})
		if !reflect.DeepEqual(f.s.PendingAttack.Roll, []int{1}) {
			t.Fatal(f.s.PendingAttack)
		}
		rejectMovement(t, f, Action{Type: ActAssignDelete, TargetIDs: []string{f.target}})
		if !reflect.DeepEqual(f.s.PendingAttack.Roll, []int{1}) {
			t.Fatal("rejection changed public roll")
		}
	}
	f := defenseSpaceFixture(t, true)
	if !reflect.DeepEqual(mustDefenseProfile(t, f, f.target), EffectiveDefenseDice(f.gd, f.s.Cybernet.PawnByID(f.target))) {
		t.Fatal("frozen defense changed")
	}
}
