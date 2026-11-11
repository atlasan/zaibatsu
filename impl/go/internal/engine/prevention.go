package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func PreventionCards(s *domain.GameState, gd *domain.GameData, pawnID string) []string {
	cards := []string{}
	pawn := s.Cybernet.PawnByID(pawnID)
	if pawn == nil {
		return cards
	}
	for _, att := range pawn.Attachments {
		card := cardByID(gd, att.CardID)
		if card != nil && card.Attach != nil && card.Attach.EliminationPrevention != nil && card.Attach.EliminationPrevention.Kind == "discard-self" && !containsString(cards, att.CardID) {
			cards = append(cards, att.CardID)
		}
	}
	return cards
}

func offerEliminationPrevention(s *domain.GameState, gd *domain.GameData, pawnID, cause string) (bool, error) {
	cards := PreventionCards(s, gd, pawnID)
	if len(cards) == 0 {
		return false, nil
	}
	if cause == "sacrifice" {
		return false, fmt.Errorf("sacrifice versus elimination prevention is unresolved; this combination remains provisional")
	}
	if s.PendingChoice != nil || len(s.PendingEliminations) > 0 {
		return false, fmt.Errorf("simultaneous elimination-prevention ordering is unresolved; this combination remains provisional")
	}
	pawn := s.Cybernet.PawnByID(pawnID)
	if s.PlayerByID(pawn.OwnerID) == nil {
		return false, fmt.Errorf("the prevention decision needs a controlling player")
	}
	s.DecisionSerial++
	id := fmt.Sprintf("elimination:%d:%d", s.Turn, s.DecisionSerial)
	s.PendingEliminations = []domain.PendingElimination{{ID: id, PawnID: pawnID, PlayerID: pawn.OwnerID, Cause: cause}}
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: pawn.OwnerID, Kind: "prevent-elimination", EffectID: id, PawnID: pawnID, CardID: cards[0], CardIDs: cards}
	return true, nil
}

// attemptEliminatePawn defers final cleanup only for a source-defined replacement.
func attemptEliminatePawn(s *domain.GameState, gd *domain.GameData, pawnID, cause string, events ...*[]EngineEvent) (bool, error) {
	offered, err := offerEliminationPrevention(s, gd, pawnID, cause)
	if err != nil || offered {
		return false, err
	}
	return finalizePawnElimination(s, pawnID, gd, phaseEventSink(events)), nil
}

func PreventionResponses(s *domain.GameState, gd *domain.GameData) []Action {
	out := []Action{}
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "prevent-elimination" {
		return out
	}
	for _, cardID := range PreventionCards(s, gd, choice.PawnID) {
		out = append(out, Action{Type: ActResolveChoice, ChoiceID: choice.ID, PlayerID: choice.PlayerID, OptionID: "prevent", CardID: cardID})
	}
	return append(out, Action{Type: ActResolveChoice, ChoiceID: choice.ID, PlayerID: choice.PlayerID, OptionID: "allow"})
}

func ResolveEliminationChoice(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "prevent-elimination" || choice.ID != a.ChoiceID || len(s.PendingEliminations) != 1 || s.PendingEliminations[0].ID != choice.EffectID {
		return fmt.Errorf("unknown or stale elimination choice")
	}
	if a.Coord != nil || a.SpaceID != "" || len(a.CardIDs) > 0 || a.TargetID != "" || len(a.TargetIDs) > 0 || len(a.Path) > 0 || a.PawnID != "" || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 || a.Joint || a.Dir != 0 || a.Rotation != 0 || a.MovementIndex != 0 {
		return fmt.Errorf("prevention cannot include another payment, target or movement")
	}
	pawn := s.Cybernet.PawnByID(choice.PawnID)
	if pawn == nil || pawn.OwnerID != choice.PlayerID {
		return fmt.Errorf("the threatened pawn is unavailable")
	}
	switch a.OptionID {
	case "prevent":
		if a.CardID == "" || !containsString(PreventionCards(s, gd, pawn.PawnID), a.CardID) {
			return fmt.Errorf("choose an attached prevention card")
		}
		for i, att := range pawn.Attachments {
			if att.CardID == a.CardID {
				DiscardPawnAttachment(s, gd, pawn, i, events)
				*events = append(*events, EngineEvent{Type: "elimination-prevented", PawnID: pawn.PawnID, PlayerID: choice.PlayerID, CardID: att.CardID})
				break
			}
		}
	case "allow":
		if a.CardID != "" {
			return fmt.Errorf("allowing elimination does not also spend a prevention card")
		}
		finalizePawnElimination(s, pawn.PawnID, gd, events)
	default:
		return fmt.Errorf("choose prevent or allow elimination")
	}
	s.PendingChoice = nil
	s.PendingEliminations = nil
	return nil
}
