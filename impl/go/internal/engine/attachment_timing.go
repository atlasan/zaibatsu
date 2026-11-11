package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func SupportsAttachmentTiming(card *domain.ActionCard) bool {
	effects := []domain.CardEffect{}
	for _, effect := range card.Effects {
		if effect.Trigger == "on-attach" {
			effects = append(effects, effect)
		}
	}
	if len(effects) == 0 {
		return true
	}
	return len(effects) == 1 && effects[0].Kind == "gain-target-control" && card.Attach != nil && card.Attach.As == "enemy" && card.Attach.Cost == 0 && effects[0].Amount == 0 && effects[0].Target == ""
}
func ValidateAttachmentRules(card *domain.ActionCard) error {
	for _, effect := range card.Effects {
		if effect.Kind == "gain-target-control" && (effect.Trigger != "on-attach" || !SupportsAttachmentTiming(card)) {
			return fmt.Errorf("unsupported gain-target-control timing, target, cost or sequencing")
		}
	}
	if card.Attach != nil {
		for _, use := range card.Attach.AbilityUses {
			if use.Ability == "move" && use.Dice != "" {
				return fmt.Errorf("unsupported source rolled movement-use budget; encode die steps as a movement type")
			}
		}
		if card.Attach.ControllerHand != "" && (card.Attach.ControllerHand != "face-up" || (card.Attach.As != "pawn" && card.Attach.As != "enemy")) {
			return fmt.Errorf("unsupported controller hand visibility")
		}
		if card.Attach.ForbiddenDestinations != nil && len(card.Attach.ForbiddenDestinations) != 1 {
			return fmt.Errorf("unsupported attachment movement destination restriction")
		}
		for _, kind := range card.Attach.ForbiddenDestinations {
			if kind != "central-core" || (card.Attach.As != "pawn" && card.Attach.As != "enemy") {
				return fmt.Errorf("unsupported attachment movement destination restriction")
			}
		}
	}
	return nil
}
