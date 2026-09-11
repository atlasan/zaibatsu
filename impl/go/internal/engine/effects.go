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

func amountFromCardEffect(effect domain.CardEffect) int {
        if effect.Amount > 0 {
                return effect.Amount
        }
        return 1
}

type EffectResolution struct {
        Kind     string                `json:"kind"`
        Result    *DeleteAreaResult     `json:"result,omitempty"`
        Pawn     *domain.PawnOnBoard   `json:"pawn,omitempty"`
        PlayerID string                `json:"playerId,omitempty"`
        Amount   int                   `json:"amount,omitempty"`
}

func placePawnEffect(s *domain.GameState, gd *domain.GameData, playerID string, coord domain.Coord, pawnID string) *EffectResolution {
        if pawnID == "" || s.PlayerByID(playerID) == nil {
                return nil
        }
        if _, ok := gd.PawnByID(pawnID); !ok || s.Cybernet.PawnByID(pawnID) != nil {
                return nil
        }
        spaceID := firstOpenSpace(gd, s.Cybernet, coord, pawnID)
        if spaceID == "" {
                return nil
        }
        for i, eliminatedID := range s.Eliminated {
                if eliminatedID == pawnID {
                        s.Eliminated = append(s.Eliminated[:i], s.Eliminated[i+1:]...)
                        break
                }
        }
        pawn := &domain.PawnOnBoard{PawnID: pawnID, OwnerID: playerID, Coord: coord, SpaceID: spaceID}
        s.Cybernet.PlacePawn(pawn)
        return &EffectResolution{Kind: "place-pawn", Pawn: pawn}
}

func applyTypedBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect) *EffectResolution {
	if effect == nil {
		return nil
	}
	switch effect.Kind {
	case "area-attack":
		result := resolveDeleteAreaAtCoord(s, gd, coord, skullsFromBlockEffect(effect))
                return &EffectResolution{Kind: "area-attack", Result: &result}
        case "place-pawn":
                placed := s.Cybernet.At(coord)
                if placed == nil || placed.OwnerID == "" {
                        return nil
                }
                return placePawnEffect(s, gd, placed.OwnerID, coord, effect.Target)
	default:
		return nil
	}
}

func ApplyBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect) *EffectResolution {
	if effect == nil || effect.Kind == "" {
		return nil
	}
	return applyTypedBlockEffect(s, gd, coord, effect)
}

func ApplyBlockEffectForTrigger(s *domain.GameState, gd *domain.GameData, coord domain.Coord, trigger BlockEffectTrigger) *EffectResolution {
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

func cardEffectsForTrigger(gd *domain.GameData, cardID, trigger string) []domain.CardEffect {
        card := cardByID(gd, cardID)
        if card == nil {
                return nil
        }
        out := []domain.CardEffect{}
        for _, effect := range card.Effects {
                effectTrigger := effect.Trigger
                if effectTrigger == "" {
                        effectTrigger = "on-play"
                }
                if effectTrigger == trigger {
                        out = append(out, effect)
                }
        }
        return out
}

func applyCardEffect(s *domain.GameState, gd *domain.GameData, playerID string, coord *domain.Coord, effect domain.CardEffect) *EffectResolution {
        switch effect.Kind {
        case "place-pawn":
                if coord == nil {
                        return nil
                }
                return placePawnEffect(s, gd, playerID, *coord, effect.Target)
        case "gain-bonus":
                player := s.PlayerByID(playerID)
                if player == nil {
                        return nil
                }
                amount := amountFromCardEffect(effect)
                player.BonusCounters += amount
                return &EffectResolution{Kind: "gain-bonus", PlayerID: playerID, Amount: amount}
        default:
                return nil
        }
}

func ApplyCardEffectsForTrigger(s *domain.GameState, gd *domain.GameData, playerID, cardID, trigger string, coord *domain.Coord) []*EffectResolution {
        effects := cardEffectsForTrigger(gd, cardID, trigger)
        out := make([]*EffectResolution, 0, len(effects))
        for _, effect := range effects {
                if resolution := applyCardEffect(s, gd, playerID, coord, effect); resolution != nil {
                        out = append(out, resolution)
                }
        }
        return out
}
