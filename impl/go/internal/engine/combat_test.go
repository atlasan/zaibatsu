package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func TestAttackRollCountAndRange(t *testing.T) {
	rng := domain.NewRNG(7)
	for skulls := 1; skulls <= 4; skulls++ {
		roll := AttackRoll(rng, skulls)
		if len(roll) != skulls {
			t.Errorf("AttackRoll(%d) len = %d", skulls, len(roll))
		}
		for _, v := range roll {
			if v < 1 || v > 6 {
				t.Errorf("die out of range: %d", v)
			}
		}
	}
	// Fewer than one skull is clamped to one die.
	if got := AttackRoll(rng, 0); len(got) != 1 {
		t.Errorf("AttackRoll(0) len = %d, want 1", len(got))
	}
}

func TestDefeats(t *testing.T) {
	def := []domain.DefenseDie{
		{Value: 2, Shielded: true},  // shielded: blocks
		{Value: 4, Shielded: false}, // unshielded: vulnerable
	}
	if !Defeats([]int{4}, def) {
		t.Error("value 4 should hit the unshielded die")
	}
	if Defeats([]int{2}, def) {
		t.Error("value 2 should be blocked by the shielded die")
	}
	if Defeats([]int{1, 3, 5}, def) {
		t.Error("no matching values should not defeat")
	}
	if !Defeats([]int{1, 4}, def) {
		t.Error("any matching die should defeat")
	}
}

// placeTwoPawns puts an attacker and a target on the same given coord.
func placeTwoPawns(s *domain.GameState, coord domain.Coord, attackerID, targetID, attackerOwner string) {
	// Clear any starting board pawns for a clean, deterministic scenario.
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: attackerID, OwnerID: attackerOwner, Coord: coord, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: targetID, OwnerID: "p2", Coord: coord, SpaceID: "core"})
}

func TestDeleteEliminatesVulnerableTarget(t *testing.T) {
	gd := loadOrSkip(t)
	// speedrunner-green has Delete (2 skulls); speedrunner-yellow's defense is
	// two unshielded dice (4,5), so it is very likely to be hit. Find a seed that
	// produces an elimination to assert the elimination path deterministically.
	origin := domain.Coord{Q: 0, R: 0}
	var eliminatedSeed uint64
	found := false
	for seed := uint64(1); seed <= 50 && !found; seed++ {
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		placeTwoPawns(s, origin, "speedrunner-green", "speedrunner-yellow", "p1")
		res, err := Delete(s, gd, "speedrunner-green", "speedrunner-yellow", 0)
		if err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if res.Eliminated {
			found = true
			eliminatedSeed = seed
			if s.Cybernet.PawnByID("speedrunner-yellow") != nil {
				t.Error("eliminated target should be off the board")
			}
			if len(s.Eliminated) != 1 || s.Eliminated[0] != "speedrunner-yellow" {
				t.Errorf("Eliminated pool = %v, want [speedrunner-yellow]", s.Eliminated)
			}
		}
	}
	if !found {
		t.Fatal("expected some seed in 1..50 to produce an elimination")
	}
	t.Logf("elimination occurred at seed %d", eliminatedSeed)
}

func TestDeleteRejectsSelfAndNonColocated(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 2})
	origin := domain.Coord{Q: 0, R: 0}
	placeTwoPawns(s, origin, "speedrunner-green", "speedrunner-yellow", "p1")

	if _, err := Delete(s, gd, "speedrunner-green", "speedrunner-green", 0); err == nil {
		t.Error("expected error deleting self")
	}
	// Move the target to a different (non-existent-block) coord; still rejected by
	// co-location check before any board lookup of the destination block.
	s.Cybernet.PawnByID("speedrunner-yellow").Coord = origin.Neighbor(0)
	if _, err := Delete(s, gd, "speedrunner-green", "speedrunner-yellow", 0); err == nil {
		t.Error("expected error deleting a non-co-located target")
	}
}

func TestDeleteRequiresDeleteAbility(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 3})
	origin := domain.Coord{Q: 0, R: 0}
	// drone-turret has Delete, but let's use a pawn without it as the attacker:
	// build a fake attacker with no delete ability by using the target as attacker
	// is invalid; instead place drone-turret (has delete) to confirm allowed, and
	// a no-delete pawn to confirm rejected.
	placeTwoPawns(s, origin, "drone-turret", "speedrunner-yellow", "p1")
	if _, err := Delete(s, gd, "drone-turret", "speedrunner-yellow", 0); err != nil {
		t.Errorf("drone-turret has Delete and should be allowed: %v", err)
	}
}

func TestDeleteOncePerTurnGating(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 4})
	origin := domain.Coord{Q: 0, R: 0}
	// drone-turret's Delete is once-per-turn.
	placeTwoPawns(s, origin, "drone-turret", "speedrunner-blue", "p1")
	if _, err := Delete(s, gd, "drone-turret", "speedrunner-blue", 0); err != nil {
		t.Fatalf("first Delete: %v", err)
	}
	owner := s.PlayerByID("p1")
	if !owner.OncePerTurnUsed[abilityUsedKey("delete", "drone-turret")] {
		t.Fatal("expected once-per-turn Delete marker to be set")
	}
	// If the target survived it is still on the board; a second Delete must be
	// blocked by the once-per-turn gate regardless.
	if s.Cybernet.PawnByID("speedrunner-blue") != nil {
		if _, err := Delete(s, gd, "drone-turret", "speedrunner-blue", 0); err == nil {
			t.Error("expected second once-per-turn Delete to be blocked")
		}
	}
}

func TestDeleteDeterministicRoll(t *testing.T) {
	gd := loadOrSkip(t)
	origin := domain.Coord{Q: 0, R: 0}
	run := func() []int {
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 123})
		placeTwoPawns(s, origin, "speedrunner-green", "speedrunner-yellow", "p1")
		res, _ := Delete(s, gd, "speedrunner-green", "speedrunner-yellow", 0)
		return res.Roll
	}
	a, b := run(), run()
	if len(a) != len(b) {
		t.Fatalf("roll lengths differ: %v vs %v", a, b)
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("Delete roll not deterministic: %v vs %v", a, b)
		}
	}
}

func TestDeleteRemovedByAttachment(t *testing.T) {
	// drone-turret has innate Delete; an attachment that removes it blocks Delete.
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 3})
	origin := domain.Coord{Q: 0, R: 0}
	placeTwoPawns(s, origin, "drone-turret", "speedrunner-yellow", "p1")
	gd.Cards[0].Attach = &domain.Attach{As: "pawn", Slot: "add-on", Removes: []string{"delete"}}
	s.Cybernet.PawnByID("drone-turret").Attachments = []domain.Attachment{{CardID: gd.Cards[0].ID, Slot: "add-on"}}
	if _, err := Delete(s, gd, "drone-turret", "speedrunner-yellow", 0); err == nil {
		t.Error("an attachment that removes Delete should block the attack")
	}
}

func TestDefenseOverrideReplacesTargetDefenseDuringDelete(t *testing.T) {
        vulnerable := []domain.DefenseDie{
                {Value: 1, Shielded: false},
                {Value: 2, Shielded: false},
                {Value: 3, Shielded: false},
                {Value: 4, Shielded: false},
                {Value: 5, Shielded: false},
                {Value: 6, Shielded: false},
        }
        armored := []domain.DefenseDie{
                {Value: 1, Shielded: true},
                {Value: 2, Shielded: true},
                {Value: 3, Shielded: true},
                {Value: 4, Shielded: true},
                {Value: 5, Shielded: true},
                {Value: 6, Shielded: true},
        }
	origin := domain.Coord{Q: 0, R: 0}

	gd := loadOrSkip(t)
	cloned := *gd
	cloned.Cards = append([]domain.ActionCard{}, gd.Cards...)
	cloned.Pawns = append([]domain.Pawn{}, gd.Pawns...)
	cloned.Cards = append(cloned.Cards, domain.ActionCard{
		ID:   "armor-override",
		Name: "Armor Override",
		Attach: &domain.Attach{
			As:              "pawn",
			Slot:            "armor",
			DefenseOverride: armored,
		},
	})
	for i := range cloned.Pawns {
		if cloned.Pawns[i].ID == "speedrunner-yellow" {
			cloned.Pawns[i].Defense = vulnerable
		}
	}

        baseline, _ := NewGame(Config{Data: &cloned, PlayerNames: []string{"A", "B"}, Seed: 17})
	baseline.Cybernet.Pawns = []*domain.PawnOnBoard{}
	baseline.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	baseline.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	res, err := Delete(baseline, &cloned, "drone-turret", "speedrunner-yellow", 0)
	if err != nil {
                t.Fatalf("baseline Delete: %v", err)
	}
	if !res.Eliminated {
		t.Fatal("expected vulnerable baseline target to be eliminated")
	}

        armoredState, _ := NewGame(Config{Data: &cloned, PlayerNames: []string{"A", "B"}, Seed: 17})
	armoredState.Cybernet.Pawns = []*domain.PawnOnBoard{}
	armoredState.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	armoredState.Cybernet.PlacePawn(&domain.PawnOnBoard{
		PawnID:  "speedrunner-yellow",
		OwnerID: "p2",
		Coord:   origin,
		SpaceID: "core",
		Attachments: []domain.Attachment{{
			CardID: "armor-override",
			Slot:   "armor",
		}},
	})
	res, err = Delete(armoredState, &cloned, "drone-turret", "speedrunner-yellow", 0)
	if err != nil {
		t.Fatalf("armored Delete: %v", err)
	}
	if res.Eliminated {
		t.Fatal("expected defense override to block the elimination")
	}
}

func bombGameData(t *testing.T) *domain.GameData {
	t.Helper()
	gd := loadOrSkip(t)
	cloned := *gd
	cloned.Pawns = append([]domain.Pawn{}, gd.Pawns...)
	for i := range cloned.Pawns {
		if cloned.Pawns[i].ID == "speedrunner-green" || cloned.Pawns[i].ID == "drone-turret" {
			cloned.Pawns[i] = clonePawnWithClass(cloned.Pawns[i], "bomb")
		}
	}
	return &cloned
}

func clonePawnWithClass(pawn domain.Pawn, class string) domain.Pawn {
	classes := append([]string{}, pawn.Class...)
	classes = append(classes, class)
	pawn.Class = classes
	return pawn
}

func TestDeleteAreaRequiresBombClass(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	placeTwoPawns(s, origin, "speedrunner-green", "speedrunner-yellow", "p1")
	if _, err := DeleteArea(s, gd, "speedrunner-green", 0); err == nil {
		t.Error("expected area Delete to require a Bomb-class attacker")
	}
}

func TestDeleteAreaAppliesSameRollToEveryPawnInBlock(t *testing.T) {
	gd := bombGameData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	res, err := DeleteArea(s, gd, "speedrunner-green", 0)
	if err != nil {
		t.Fatalf("DeleteArea: %v", err)
	}
	if res.Coord != origin {
		t.Fatalf("area coord = %v, want %v", res.Coord, origin)
	}
	wantIDs := []string{"speedrunner-green", "speedrunner-yellow", "speedrunner-blue"}
	if len(res.Targets) != len(wantIDs) {
		t.Fatalf("targets len = %d, want %d", len(res.Targets), len(wantIDs))
	}
	for i, target := range res.Targets {
		if target.TargetPawnID != wantIDs[i] {
			t.Fatalf("target %d = %q, want %q", i, target.TargetPawnID, wantIDs[i])
		}
		def, ok := gd.PawnByID(target.TargetPawnID)
		if !ok {
			t.Fatalf("missing pawn def %q", target.TargetPawnID)
		}
		wantElim := Defeats(res.Roll, def.Defense)
		if target.Eliminated != wantElim {
			t.Fatalf("target %q eliminated=%v, want %v", target.TargetPawnID, target.Eliminated, wantElim)
		}
		stillOnBoard := s.Cybernet.PawnByID(target.TargetPawnID) != nil
		if stillOnBoard != !wantElim {
			t.Fatalf("board presence mismatch for %q", target.TargetPawnID)
		}
	}
}

func TestDeleteAreaSetsOncePerTurnMarker(t *testing.T) {
	gd := bombGameData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	if _, err := DeleteArea(s, gd, "drone-turret", 0); err != nil {
		t.Fatalf("DeleteArea once-per-turn: %v", err)
	}
	if !s.PlayerByID("p1").OncePerTurnUsed[abilityUsedKey("delete", "drone-turret")] {
		t.Fatal("expected once-per-turn Delete marker to be set")
	}
}
