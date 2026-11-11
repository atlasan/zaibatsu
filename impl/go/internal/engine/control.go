package engine

import "github.com/zaibatsu/zaibatsu-go/internal/domain"

// SetPawnControl keeps a physical control card in the same zone as its pawn.
func SetPawnControl(s *domain.GameState, pawnID, ownerID string) {
	if pawn := s.Cybernet.PawnByID(pawnID); pawn != nil {
		pawn.OwnerID = ownerID
	}
	for i := range s.ControlCards {
		card := &s.ControlCards[i]
		if card.Subject.Kind == "pawn" && card.Subject.ID == pawnID {
			card.OwnerID = ownerID
			if s.RulesVersion != "" {
				card.Zone = "common"
				if ownerID != "" {
					card.Zone = "control"
				}
			}
		}
	}
}
