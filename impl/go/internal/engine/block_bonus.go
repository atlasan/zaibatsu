package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func ValidateBlockBonus(block *domain.Block, strict bool) error {
	first, second := block.Effects.InCybernet, block.Effects.UnderControl
	matches := func(e *domain.BlockEffect) bool {
		return e != nil && (e.Kind == "place-block-bonus" || e.Kind == "collect-block-bonus")
	}
	if !matches(first) && !matches(second) {
		return nil
	}
	if first == nil || first.Kind != "place-block-bonus" || first.Amount != 1 || second == nil || second.Kind != "collect-block-bonus" || second.Amount != 0 {
		return fmt.Errorf("block bonus requires placement of one counter and collection on control")
	}
	for _, e := range []*domain.BlockEffect{first, second} {
		if e.Target != "" || e.Scope != "" || e.Optional || e.MinimumControlledPawns != 0 || e.MarkerThreshold != 0 {
			return fmt.Errorf("block bonus cannot add a target, optional policy or other costs")
		}
	}
	if strict {
		return fmt.Errorf("block bonus reserve shortfall policy remains unresolved in official content")
	}
	return nil
}

func PlaceBlockBonus(s *domain.GameState, gd *domain.GameData, coord domain.Coord, events *[]EngineEvent) error {
	placed := s.Cybernet.At(coord)
	if s.RulesVersion == "" || placed == nil {
		return fmt.Errorf("block bonus requires a source block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return fmt.Errorf("unknown block")
	}
	if err := ValidateBlockBonus(block, false); err != nil {
		return err
	}
	if block.Effects.InCybernet == nil || block.Effects.InCybernet.Kind != "place-block-bonus" {
		return fmt.Errorf("no block counter placement effect")
	}
	if placed.BonusCounter != nil {
		return fmt.Errorf("this physical block counter has already been placed")
	}
	if err := RequireBonusReserve(s, 1); err != nil {
		return err
	}
	placed.BonusCounter = &domain.BlockBonusCounter{}
	*events = append(*events, EngineEvent{Type: EventBonusCounterPlaced, Element: "block", ElementID: placed.BlockID, Coord: &domain.Coord{Q: coord.Q, R: coord.R}, Amount: 1})
	return nil
}

func CollectBlockBonus(s *domain.GameState, gd *domain.GameData, coord domain.Coord, events *[]EngineEvent) error {
	placed := s.Cybernet.At(coord)
	if s.RulesVersion == "" || placed == nil || s.PlayerByID(placed.OwnerID) == nil {
		return fmt.Errorf("block counter collection requires its controlling player")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return fmt.Errorf("unknown block")
	}
	if err := ValidateBlockBonus(block, false); err != nil {
		return err
	}
	if _, err := BonusCounterPool(s); err != nil {
		return err
	}
	if block.Effects.UnderControl == nil || block.Effects.UnderControl.Kind != "collect-block-bonus" || placed.BonusCounter == nil {
		return fmt.Errorf("the placed physical block counter is missing")
	}
	if placed.BonusCounter.CollectedBy != "" {
		return nil
	}
	placed.BonusCounter.CollectedBy = placed.OwnerID
	s.PlayerByID(placed.OwnerID).BonusCounters++
	*events = append(*events, EngineEvent{Type: EventBonusCollected, PlayerID: placed.OwnerID, Element: "block", ElementID: placed.BlockID, Coord: &domain.Coord{Q: coord.Q, R: coord.R}, Amount: 1})
	return nil
}
