package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func allFacesDefense() []domain.DefenseDie {
	out := make([]domain.DefenseDie, 6)
	for i := range out {
		out[i] = domain.DefenseDie{Value: i + 1}
	}
	return out
}

func effectData(t *testing.T) *domain.GameData {
	t.Helper()
	gd := loadOrSkip(t)
	cloned := *gd
	cloned.Blocks = append([]domain.Block{}, gd.Blocks...)
	cloned.Pawns = append([]domain.Pawn{}, gd.Pawns...)
	for i := range cloned.Blocks {
		if cloned.Blocks[i].ID == "data-haven" {
			cloned.Blocks[i].Effects = domain.BlockEffects{
				InCybernet:   &domain.BlockEffect{Kind: "area-attack", Amount: 1},
				UnderControl: &domain.BlockEffect{Kind: "area-attack", Amount: 1},
			}
		}
	}
	for i := range cloned.Pawns {
		if cloned.Pawns[i].ID == "speedrunner-yellow" {
			cloned.Pawns[i].Defense = allFacesDefense()
		}
	}
	return &cloned
}

func TestApplyBlockEffectAreaAttack(t *testing.T) {
	gd := effectData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
		t.Fatalf("place: %v", err)
	}
	coord := origin.Neighbor(0)
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: coord, SpaceID: "a"})

        res := ApplyBlockEffect(s, gd, coord, &domain.BlockEffect{Kind: "area-attack", Amount: 1})
        if res == nil {
		t.Fatal("expected typed area-attack effect result")
	}
        if res.Kind != "area-attack" || res.Result == nil {
                t.Fatalf("unexpected effect result: %#v", res)
        }
        if len(res.Result.Targets) != 2 {
                t.Fatalf("expected 2 targets, got %d", len(res.Result.Targets))
	}
	if s.Cybernet.PawnByID("speedrunner-yellow") != nil {
		t.Fatal("speedrunner-yellow should be eliminated by the block effect")
	}
}

func TestApplyBlockEffectForTriggerUsesPlacedBlockEffect(t *testing.T) {
	gd := effectData(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	if _, err := PlaceBlock(s, origin, 0, gd, "data-haven", rotFacing(t, gd, "data-haven", 0)); err != nil {
		t.Fatalf("place: %v", err)
	}
	coord := origin.Neighbor(0)
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: coord, SpaceID: "a"})

	res := ApplyBlockEffectForTrigger(s, gd, coord, BlockEffectInCybernet)
        if res == nil {
		t.Fatal("expected trigger lookup to return an effect result")
	}
        if res.Kind != "area-attack" || res.Result == nil {
                t.Fatalf("unexpected effect result: %#v", res)
        }
	if s.Cybernet.PawnByID("speedrunner-yellow") != nil {
		t.Fatal("speedrunner-yellow should be eliminated by the placed block's trigger")
	}
}

func TestApplyBlockEffectForTriggerPlacePawnOnControl(t *testing.T) {
        gd := loadOrSkip(t)
        cloned := *gd
        cloned.Blocks = append([]domain.Block{}, gd.Blocks...)
        for i := range cloned.Blocks {
                if cloned.Blocks[i].ID == "idoru" {
                        cloned.Blocks[i].IceFaces = []int{1, 2, 3, 4, 5, 6}
                }
        }
        gd = &cloned
        s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
        origin := domain.Coord{Q: 0, R: 0}
        if _, err := PlaceBlock(s, origin, 0, gd, "idoru", rotFacing(t, gd, "idoru", 0)); err != nil {
                t.Fatalf("place: %v", err)
        }
        coord := origin.Neighbor(0)
        s.Cybernet.Pawns = []*domain.PawnOnBoard{}
        s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-red", OwnerID: "p1", Coord: coord, SpaceID: "a"})

        res, err := IcebreakBlock(s, gd, "speedrunner-red", coord, 0)
        if err != nil {
                t.Fatalf("IcebreakBlock: %v", err)
        }
        if !res.Success {
                t.Fatal("expected IcebreakBlock to succeed")
        }
        placed := s.Cybernet.PawnByID("idoru")
        if placed == nil {
                t.Fatal("expected Idoru to be placed by the block effect")
        }
        if placed.OwnerID != "p1" || placed.Coord != coord {
                t.Fatalf("idoru = %#v, want owner p1 at %v", placed, coord)
        }
}
