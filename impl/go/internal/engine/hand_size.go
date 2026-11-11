package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type HandSizeProfile struct {
	Base        int `json:"base"`
	Attachments int `json:"attachments"`
	Spaces      int `json:"spaces"`
	Maximum     int `json:"maximum"`
}

func ValidateHandSizeSpaces(block *domain.Block) error {
	for _, sp := range block.Spaces {
		m := sp.Modifier
		if m != nil && m.Kind == "hand-size" && (m.Amount == 0 || m.Dice != nil) {
			return fmt.Errorf("hand-size space requires a nonzero signed amount without defense dice")
		}
	}
	return nil
}
func HandSizeProfileFor(s *domain.GameState, gd *domain.GameData, playerID string) (HandSizeProfile, error) {
	p := s.PlayerByID(playerID)
	if p == nil {
		return HandSizeProfile{}, fmt.Errorf("hand-size profile requires a registered player")
	}
	_, attached := PlayerAttachmentModifiers(s, gd, playerID)
	profile := HandSizeProfile{Base: p.MaxHandSize, Attachments: attached}
	if s.RulesVersion != "" {
		for _, pawn := range s.Cybernet.Pawns {
			if pawn.OwnerID != playerID {
				continue
			}
			placed := s.Cybernet.At(pawn.Coord)
			if placed == nil {
				continue
			}
			block, ok := gd.BlockByID(placed.BlockID)
			if !ok {
				continue
			}
			for _, sp := range block.Spaces {
				if sp.ID == pawn.SpaceID && sp.Modifier != nil && sp.Modifier.Kind == "hand-size" {
					if err := ValidateHandSizeSpaces(block); err != nil {
						return profile, err
					}
					profile.Spaces += sp.Modifier.Amount
				}
			}
		}
	}
	profile.Maximum = max(0, profile.Base+profile.Attachments+profile.Spaces)
	return profile, nil
}
