package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"sort"
)

func ValidateSpaceModifier(m *domain.SpaceModifier, strict bool) error {
	if m == nil {
		return nil
	}
	if m.Dice != nil {
		if m.Kind != "defense" || m.Amount != 0 || len(m.Dice) == 0 || len(m.Dice) > 6 {
			return fmt.Errorf("defense-space dice require unique printed faces and shielding without a numeric amount")
		}
		seen := map[int]bool{}
		for _, d := range m.Dice {
			if d.Value < 1 || d.Value > 6 || seen[d.Value] {
				return fmt.Errorf("defense-space dice require unique printed faces and shielding without a numeric amount")
			}
			seen[d.Value] = true
		}
	} else if m.Kind == "defense" && strict {
		return fmt.Errorf("unresolved numeric defense-space modifier; author printed faces and shielding")
	}
	return nil
}
func ValidateBlockDefenseSpaces(block *domain.Block, strict bool) error {
	for _, space := range block.Spaces {
		if err := ValidateSpaceModifier(space.Modifier, strict); err != nil {
			return err
		}
	}
	return nil
}

// DefenseProfile applies printed space faces after the pawn/armor profile.
func DefenseProfile(s *domain.GameState, gd *domain.GameData, pawn *domain.PawnOnBoard) ([]domain.DefenseDie, error) {
	dice := EffectiveDefenseDice(gd, pawn)
	if gd.RegressionFixture == "provisional-v1" {
		return dice, nil
	}
	var modifier *domain.SpaceModifier
	if placed := s.Cybernet.At(pawn.Coord); placed != nil {
		if block, ok := gd.BlockByID(placed.BlockID); ok {
			for _, space := range block.Spaces {
				if space.ID == pawn.SpaceID {
					modifier = space.Modifier
					break
				}
			}
		}
	}
	if err := ValidateSpaceModifier(modifier, true); err != nil {
		return nil, err
	}
	if modifier != nil && modifier.Kind == "defense" {
		for _, printed := range modifier.Dice {
			found := false
			for i := range dice {
				if dice[i].Value == printed.Value {
					dice[i].Shielded = printed.Shielded
					found = true
					break
				}
			}
			if !found {
				dice = append(dice, printed)
			}
		}
		sort.Slice(dice, func(i, j int) bool { return dice[i].Value < dice[j].Value })
	}
	return dice, nil
}
