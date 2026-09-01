package engine

import "github.com/zaibatsu/zaibatsu-go/internal/domain"

type BlockEffectTrigger string

const (
	BlockEffectInCybernet   BlockEffectTrigger = "inCybernet"
	BlockEffectUnderControl BlockEffectTrigger = "underControl"
)

func skullsFromBlockEffect(effect *domain.BlockEffect) int {
	if effect != nil && effect.Amount > 0 {
		return effect.Amount
	}
	return 1
}

func applyTypedBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect) *DeleteAreaResult {
	if effect == nil {
		return nil
	}
	switch effect.Kind {
	case "area-attack":
		result := resolveDeleteAreaAtCoord(s, gd, coord, skullsFromBlockEffect(effect))
		return &result
	default:
		return nil
	}
}

func ApplyBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect) *DeleteAreaResult {
	if effect == nil || effect.Kind == "" {
		return nil
	}
	return applyTypedBlockEffect(s, gd, coord, effect)
}

func ApplyBlockEffectForTrigger(s *domain.GameState, gd *domain.GameData, coord domain.Coord, trigger BlockEffectTrigger) *DeleteAreaResult {
	placed := s.Cybernet.At(coord)
	if placed == nil {
		return nil
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return nil
	}
	switch trigger {
	case BlockEffectInCybernet:
		return ApplyBlockEffect(s, gd, coord, block.Effects.InCybernet)
	case BlockEffectUnderControl:
		return ApplyBlockEffect(s, gd, coord, block.Effects.UnderControl)
	default:
		return nil
	}
}
