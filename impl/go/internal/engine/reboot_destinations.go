package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// ValidateControllerCore separates the controller's optional use from setup identity.
func ValidateControllerCore(block *domain.Block) error {
	for _, entry := range []struct {
		name   string
		effect *domain.BlockEffect
	}{{"inCybernet", block.Effects.InCybernet}, {"underControl", block.Effects.UnderControl}} {
		e := entry.effect
		if e == nil || e.Kind != "controller-core" {
			continue
		}
		count := 0
		for _, space := range block.Spaces {
			if space.ID == e.Target && space.Type == "special" && space.Capacity == domain.UnlimitedCapacity {
				count++
			}
		}
		if entry.name != "underControl" || block.IsCentralCore || e.Amount != 0 || e.MinimumControlledPawns != 0 || count != 1 {
			return fmt.Errorf("controller Core permission requires under-control timing and one unlimited special landing space")
		}
	}
	return nil
}

// RebootDestinations is a detached public query; it changes neither state nor RNG.
func RebootDestinations(s *domain.GameState, gd *domain.GameData, playerID, pawnID string) []SpaceRef {
	out := []SpaceRef{}
	if s.PlayerByID(playerID) == nil {
		return out
	}
	for _, placed := range s.Cybernet.Blocks {
		block, ok := gd.BlockByID(placed.BlockID)
		if !ok {
			continue
		}
		spaceID := ""
		if block.IsCentralCore && len(block.Spaces) > 0 {
			spaceID = block.Spaces[0].ID
		} else if placed.OwnerID == playerID && block.Effects.UnderControl != nil && block.Effects.UnderControl.Kind == "controller-core" {
			spaceID = block.Effects.UnderControl.Target
		}
		if spaceID != "" && CanEndOn(gd, s.Cybernet, placed.Coord, spaceID, pawnID) == nil {
			out = append(out, SpaceRef{Coord: placed.Coord, SpaceID: spaceID})
		}
	}
	return out
}

func rebootDestination(s *domain.GameState, gd *domain.GameData, playerID, pawnID string, requested ...SpaceRef) (SpaceRef, error) {
	options := RebootDestinations(s, gd, playerID, pawnID)
	if len(requested) > 1 {
		return SpaceRef{}, fmt.Errorf("select one Reboot destination")
	}
	if len(requested) == 1 {
		for _, o := range options {
			if o.Coord == requested[0].Coord && o.SpaceID == requested[0].SpaceID {
				return o, nil
			}
		}
		return SpaceRef{}, fmt.Errorf("select an available Reboot Core destination controlled by this player")
	}
	for _, o := range options {
		placed := s.Cybernet.At(o.Coord)
		block, ok := gd.BlockByID(placed.BlockID)
		if ok && block.IsCentralCore {
			return o, nil
		}
	}
	return SpaceRef{}, fmt.Errorf("no Central Core Reboot destination in the Cybernet")
}
