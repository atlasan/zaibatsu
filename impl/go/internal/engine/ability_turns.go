package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func ValidateAbilityTurn(pawn *domain.Pawn) error {
	if pawn.AbilityTurn != "" && pawn.AbilityTurn != "any-player-turn" {
		return fmt.Errorf("unsupported pawn ability-turn permission")
	}
	return nil
}

// Printed ability timing never grants an ability, another pawn or a free cost.
func PermittedAbilityTurn(s *domain.GameState, gd *domain.GameData, a Action) bool {
	if gd.RegressionFixture != "" || s.WinnerID != "" || s.PendingChoice != nil || s.PendingPhase != "" || s.PendingAttack != nil || s.PendingThreats != nil || a.Joint {
		return false
	}
	switch a.Type {
	case ActRollDelete, ActDelete, ActDeleteMulti, ActDeleteArea, ActPlayDelete, ActPlayDeleteMulti, ActPlayDeleteArea, ActSearch, ActPlaySearch, ActIcebreakBlk, ActIcebreakPawn, ActPlayIcebreakBlk, ActPlayIcebreakPawn, ActReboot, ActPlayReboot, ActPlayRebootCard:
	default:
		return false
	}
	id := a.PlayerID
	if id == "" {
		id = s.CurrentPlayerPtr().ID
	}
	if s.PlayerByID(id) == nil {
		return false
	}
	def, found := gd.PawnByID(a.PawnID)
	if !found || def.AbilityTurn != "any-player-turn" {
		return false
	}
	placed := s.Cybernet.PawnByID(def.ID)
	if placed == nil {
		if a.Type != ActReboot && a.Type != ActPlayReboot && a.Type != ActPlayRebootCard {
			return false
		}
		if !containsString(s.Eliminated, def.ID) {
			return false
		}
		owned := false
		for _, card := range s.ControlCards {
			if card.Subject.Kind == "pawn" && card.Subject.ID == def.ID && card.OwnerID == id {
				owned = true
			}
		}
		if !owned {
			return false
		}
	} else if placed.OwnerID != id {
		return false
	}
	if placed != nil {
		for _, t := range s.Threats {
			if t.Status != "eliminated" && t.Coord == placed.Coord {
				return false
			}
		}
	}
	return true
}

func permittedAttackAssignment(s *domain.GameState, a Action) bool {
	id := a.PlayerID
	if id == "" {
		id = s.CurrentPlayerPtr().ID
	}
	return a.Type == ActAssignDelete && s.PendingAttack != nil && s.PendingAttack.PlayerID == id
}
