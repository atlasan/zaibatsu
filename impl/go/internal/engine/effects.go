package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

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
	PlayerIDs []string            `json:"playerIds,omitempty"`
	Kind      string              `json:"kind"`
	Result    *DeleteAreaResult   `json:"result,omitempty"`
	Pawn      *domain.PawnOnBoard `json:"pawn,omitempty"`
	PlayerID  string              `json:"playerId,omitempty"`
	Amount    int                 `json:"amount,omitempty"`
}

func placePawnEffect(s *domain.GameState, gd *domain.GameData, playerID string, coord domain.Coord, pawnID string) (*EffectResolution, error) {
	if s.RulesVersion != "" && containsString(s.OutOfGame, pawnID) {
		return nil, nil
	}
	if pawnID == "" || s.PlayerByID(playerID) == nil {
		return nil, nil
	}
	if _, ok := gd.PawnByID(pawnID); !ok || s.Cybernet.PawnByID(pawnID) != nil {
		return nil, nil
	}
	spaceID := firstOpenSpace(gd, s.Cybernet, coord, pawnID)
	if spaceID == "" {
		return nil, nil
	}
	for i, eliminatedID := range s.Eliminated {
		if eliminatedID == pawnID {
			s.Eliminated = append(s.Eliminated[:i], s.Eliminated[i+1:]...)
			break
		}
	}
	pawn := &domain.PawnOnBoard{PawnID: pawnID, OwnerID: playerID, Coord: coord, SpaceID: spaceID}
	for i, id := range s.Reserve {
		if id == pawnID {
			s.Reserve = append(s.Reserve[:i], s.Reserve[i+1:]...)
			break
		}
	}
	s.Cybernet.PlacePawn(pawn)
	if err := GainPawnControl(s, gd, pawnID, playerID); err != nil {
		return nil, err
	}
	return &EffectResolution{Kind: "place-pawn", Pawn: pawn}, nil
}

func applyTypedBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect, sinks ...*[]EngineEvent) (*EffectResolution, error) {
	if effect == nil {
		return nil, nil
	}
	switch effect.Kind {
	case "place-block-bonus":
		return &EffectResolution{Kind: "block-bonus"}, PlaceBlockBonus(s, gd, coord, phaseEventSink(sinks))
	case "collect-block-bonus":
		return &EffectResolution{Kind: "block-bonus"}, CollectBlockBonus(s, gd, coord, phaseEventSink(sinks))
	case "discard-hands-above-markers":
		return &EffectResolution{Kind: "marker-hand-discard"}, DiscardHandsAboveMarkers(s, gd, coord, effect, phaseEventSink(sinks))
	case "discard-pawn-attachments":
		return &EffectResolution{Kind: "pending-block-detach"}, BeginBlockDetach(s, gd, coord)
	case "attack-pawn":
		return &EffectResolution{Kind: "pending-block-attack"}, BeginBlockAttack(s, gd, coord, effect)
	case "place-controlled-pawn":
		pawn, err := placeControlledPawn(s, gd, coord, effect.Target, phaseEventSink(sinks))
		return &EffectResolution{Kind: "place-pawn", Pawn: pawn}, err
	case "place-neutral-pawn":
		return PlaceNeutralPawn(s, gd, coord, effect.Target)
	case "controller-core":
		return &EffectResolution{Kind: "controller-core"}, nil
	case "gain-bonus-all-players":
		if effect.Amount < 1 || effect.Target != "" {
			return nil, fmt.Errorf("unsupported all-player bonus award descriptor")
		}
		if err := RequireBonusReserve(s, len(s.Players)*effect.Amount); err != nil {
			return nil, err
		}
		ids := []string{}
		for _, p := range s.Players {
			if err := GrantBonusCounters(s, p.ID, effect.Amount); err != nil {
				return nil, err
			}
			ids = append(ids, p.ID)
		}
		return &EffectResolution{Kind: "gain-bonus-all-players", PlayerIDs: ids, Amount: effect.Amount}, nil
	case "sacrifice-per-player":
		if err := BeginBlockSacrifices(s, gd, coord, effect); err != nil {
			return nil, err
		}
		return &EffectResolution{Kind: "pending-sacrifice"}, nil
	case "discard-per-controlled-pawn":
		if err := BeginBlockDiscards(s, gd, coord); err != nil {
			return nil, err
		}
		return &EffectResolution{Kind: "pending-discard"}, nil
	case "return-control-marker":
		return nil, fmt.Errorf("Cybernet marker removal is unresolved; Hacktivism remains provisional")
	case "area-attack":
		result, err := resolveDeleteAreaAtCoord(s, gd, coord, skullsFromBlockEffect(effect))
		return &EffectResolution{Kind: "area-attack", Result: &result}, err
	case "place-pawn":
		placed := s.Cybernet.At(coord)
		if placed == nil || placed.OwnerID == "" {
			return nil, nil
		}
		return placePawnEffect(s, gd, placed.OwnerID, coord, effect.Target)
	default:
		return nil, nil
	}
}

func PlaceNeutralPawn(s *domain.GameState, gd *domain.GameData, coord domain.Coord, pawnID string) (*EffectResolution, error) {
	if s.RulesVersion == "" {
		return nil, fmt.Errorf("neutral block placement requires source rules")
	}
	var spaces []domain.Space
	if placed := s.Cybernet.At(coord); placed != nil {
		if block, ok := gd.BlockByID(placed.BlockID); ok {
			for _, space := range block.Spaces {
				if space.Type == "pawn" && space.PawnID == pawnID {
					spaces = append(spaces, space)
				}
			}
		}
	}
	if _, ok := gd.PawnByID(pawnID); pawnID == "" || !ok || len(spaces) != 1 {
		return nil, fmt.Errorf("neutral placement requires one matching printed pawn space and a known pawn")
	}
	if s.Cybernet.PawnByID(pawnID) != nil || !containsString(s.Reserve, pawnID) || containsString(s.Eliminated, pawnID) || containsString(s.OutOfGame, pawnID) {
		return nil, fmt.Errorf("neutral placement requires the physical pawn in reserve")
	}
	cards := []domain.ControlCardState{}
	for _, card := range s.ControlCards {
		if card.Subject.Kind == "pawn" && card.Subject.ID == pawnID {
			cards = append(cards, card)
		}
	}
	if len(cards) != 1 || cards[0].OwnerID != "" || cards[0].Zone != "common" {
		return nil, fmt.Errorf("neutral placement requires its physical control card in the common area")
	}
	if err := CanEndOn(gd, s.Cybernet, coord, spaces[0].ID, pawnID); err != nil {
		return nil, err
	}
	pawn := &domain.PawnOnBoard{PawnID: pawnID, Coord: coord, SpaceID: spaces[0].ID}
	kept := []string{}
	for _, id := range s.Reserve {
		if id != pawnID {
			kept = append(kept, id)
		}
	}
	s.Reserve = kept
	s.Cybernet.PlacePawn(pawn)
	SetPawnControl(s, pawnID, "")
	return &EffectResolution{Kind: "place-pawn", Pawn: pawn}, nil
}

func ApplyBlockEffect(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect, sinks ...*[]EngineEvent) (*EffectResolution, error) {
	if effect == nil || effect.Kind == "" {
		return nil, nil
	}
	return applyTypedBlockEffect(s, gd, coord, effect, sinks...)
}

func ApplyBlockEffectForTrigger(s *domain.GameState, gd *domain.GameData, coord domain.Coord, trigger BlockEffectTrigger, sinks ...*[]EngineEvent) (*EffectResolution, error) {
	placed := s.Cybernet.At(coord)
	if placed == nil {
		return nil, nil
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return nil, nil
	}
	switch trigger {
	case BlockEffectInCybernet:
		return ApplyBlockEffect(s, gd, coord, block.Effects.InCybernet, sinks...)
	case BlockEffectUnderControl:
		return ApplyBlockEffect(s, gd, coord, block.Effects.UnderControl, sinks...)
	default:
		return nil, nil
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

func applyCardEffect(s *domain.GameState, gd *domain.GameData, playerID string, coord *domain.Coord, effect domain.CardEffect) (*EffectResolution, error) {
	switch effect.Kind {
	case "place-pawn":
		if coord == nil {
			return nil, nil
		}
		return placePawnEffect(s, gd, playerID, *coord, effect.Target)
	case "gain-bonus":
		player := s.PlayerByID(playerID)
		if player == nil {
			return nil, nil
		}
		amount := amountFromCardEffect(effect)
		if err := GrantBonusCounters(s, playerID, amount); err != nil {
			return nil, err
		}
		return &EffectResolution{Kind: "gain-bonus", PlayerID: playerID, Amount: amount}, nil
	default:
		return nil, nil
	}
}

func ApplyCardEffectsForTrigger(s *domain.GameState, gd *domain.GameData, playerID, cardID, trigger string, coord *domain.Coord) ([]*EffectResolution, error) {
	effects := cardEffectsForTrigger(gd, cardID, trigger)
	out := make([]*EffectResolution, 0, len(effects))
	for _, effect := range effects {
		resolution, err := applyCardEffect(s, gd, playerID, coord, effect)
		if err != nil {
			return nil, err
		}
		if resolution != nil {
			out = append(out, resolution)
		}
	}
	return out, nil
}
