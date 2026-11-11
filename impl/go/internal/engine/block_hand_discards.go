package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func ValidateMarkerHandDiscard(block *domain.Block) error {
	for i, e := range []*domain.BlockEffect{block.Effects.InCybernet, block.Effects.UnderControl} {
		if e == nil || e.Kind == "" {
			continue
		}
		if e.Kind != "discard-hands-above-markers" {
			if e.MarkerThreshold != 0 {
				return fmt.Errorf("misplaced marker hand discard threshold")
			}
			continue
		}
		if i != 1 || e.MarkerThreshold < 1 || e.Amount != 0 || e.Target != "" || e.Scope != "" || e.Optional || e.MinimumControlledPawns != 0 {
			return fmt.Errorf("marker hand discard requires under-control timing and a positive exclusive threshold without other costs/targets")
		}
	}
	return nil
}

// CybernetControlMarkerCount includes physical blocks and Idoru's counted control-card marker.
func CybernetControlMarkerCount(s *domain.GameState, playerID string) int {
	count := 0
	for _, a := range ControlMarkerAllocations(s) {
		if a.PlayerID == playerID {
			count += a.Amount
		}
	}
	return count
}

func DiscardHandsAboveMarkers(s *domain.GameState, gd *domain.GameData, coord domain.Coord, e *domain.BlockEffect, events *[]EngineEvent) error {
	placed := s.Cybernet.At(coord)
	if s.RulesVersion == "" || placed == nil {
		return fmt.Errorf("marker hand discard requires a controlled source block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok || s.PlayerByID(placed.OwnerID) == nil {
		return fmt.Errorf("marker hand discard requires a controlled source block")
	}
	if err := ValidateMarkerHandDiscard(block); err != nil {
		return err
	}
	if e == nil || e.Kind != "discard-hands-above-markers" || block.Effects.UnderControl == nil || e.MarkerThreshold != block.Effects.UnderControl.MarkerThreshold {
		return fmt.Errorf("marker hand discard requires the source descriptor")
	}
	for _, p := range s.Players {
		if CybernetControlMarkerCount(s, p.ID) <= e.MarkerThreshold {
			continue
		}
		if events != nil {
			*events = append(*events, EngineEvent{Type: "block-hand-discarded", PlayerID: p.ID, Amount: len(p.Hand), Element: "block", ElementID: block.ID})
		}
		for _, id := range p.Hand {
			s.Discard = append(s.Discard, id)
			if events != nil {
				*events = append(*events, EngineEvent{Type: "card-discarded", PlayerID: p.ID, CardID: id})
			}
		}
		p.Hand = []string{}
	}
	return nil
}
