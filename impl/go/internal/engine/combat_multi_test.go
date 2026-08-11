package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// multiScenario places a 2-skull attacker (speedrunner-green) and two co-located
// targets under p1/p2 control.
func multiScenario(s *domain.GameState) {
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
}

func TestDeleteMultiRollsPerSkullAndAssignsPerTarget(t *testing.T) {
	// speedrunner-green has 2 skulls; attack both targets.
	anyElim := false
	for seed := uint64(1); seed <= 40; seed++ {
		gd := loadOrSkip(t)
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: seed})
		multiScenario(s)
		res, err := DeleteMulti(s, gd, "speedrunner-green", []string{"speedrunner-yellow", "speedrunner-blue"}, 0)
		if err != nil {
			t.Fatalf("DeleteMulti: %v", err)
		}
		if len(res.Roll) != 2 {
			t.Fatalf("expected 2 dice (2 skulls), got %d", len(res.Roll))
		}
		if len(res.Targets) != 2 {
			t.Fatalf("expected 2 target results, got %d", len(res.Targets))
		}
		// Each target's die is the roll at its index.
		if res.Targets[0].Die != res.Roll[0] || res.Targets[1].Die != res.Roll[1] {
			t.Errorf("dice not assigned in order: %+v vs %v", res.Targets, res.Roll)
		}
		// Consistency: eliminated targets are off the board.
		for _, tr := range res.Targets {
			if tr.Eliminated {
				anyElim = true
				if s.Cybernet.PawnByID(tr.TargetPawnID) != nil {
					t.Errorf("eliminated %q still on board", tr.TargetPawnID)
				}
			}
		}
	}
	if !anyElim {
		t.Fatal("expected at least one elimination across seeds")
	}
}

func TestDeleteMultiRejectsTooManyTargets(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	// speedrunner-red has only 1 skull.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	if _, err := DeleteMulti(s, gd, "speedrunner-red", []string{"speedrunner-yellow", "speedrunner-blue"}, 0); err == nil {
		t.Error("expected error: 2 targets with only 1 skull")
	}
	// With +1 skull modifier it becomes legal.
	if _, err := DeleteMulti(s, gd, "speedrunner-red", []string{"speedrunner-yellow", "speedrunner-blue"}, 1); err != nil {
		t.Errorf("with +1 skull it should be allowed: %v", err)
	}
}

func TestDeleteMultiRejectsBadTargets(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	multiScenario(s)
	// self
	if _, err := DeleteMulti(s, gd, "speedrunner-green", []string{"speedrunner-green"}, 0); err == nil {
		t.Error("expected error: self target")
	}
	// duplicate
	if _, err := DeleteMulti(s, gd, "speedrunner-green", []string{"speedrunner-yellow", "speedrunner-yellow"}, 0); err == nil {
		t.Error("expected error: duplicate target")
	}
	// non-co-located
	s.Cybernet.PawnByID("speedrunner-yellow").Coord = domain.Coord{Q: 5, R: 0}
	if _, err := DeleteMulti(s, gd, "speedrunner-green", []string{"speedrunner-yellow"}, 0); err == nil {
		t.Error("expected error: non-co-located target")
	}
}

func TestDeleteMultiOncePerTurnGate(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	// drone-turret's Delete is once-per-turn (1 skull).
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "drone-turret", OwnerID: "p1", Coord: origin, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-blue", OwnerID: "p2", Coord: origin, SpaceID: "core"})
	if _, err := DeleteMulti(s, gd, "drone-turret", []string{"speedrunner-blue"}, 0); err != nil {
		t.Fatalf("first DeleteMulti: %v", err)
	}
	if !s.PlayerByID("p1").OncePerTurnUsed[abilityUsedKey("delete", "drone-turret")] {
		t.Error("expected once-per-turn marker set")
	}
	if s.Cybernet.PawnByID("speedrunner-blue") != nil {
		if _, err := DeleteMulti(s, gd, "drone-turret", []string{"speedrunner-blue"}, 0); err == nil {
			t.Error("expected second once-per-turn DeleteMulti to be blocked")
		}
	}
}
