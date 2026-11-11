package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func ValidateSpaceEffects(block *domain.Block, strict ...bool) error {
	for _, space := range block.Spaces {
		e := space.Effect
		if e != nil && (space.Type != "effect" || e.Kind != "discard-attachment" || (e.CardType != "add-on" && e.CardType != "gadget") || e.Scope != "cybernet" || !e.Optional) {
			return fmt.Errorf("unsupported or malformed optional space effect")
		}
		if len(strict) > 0 && strict[0] && (e != nil || space.Type == "effect") {
			return fmt.Errorf("unresolved effect-space targeting or timing in official content")
		}
	}
	return nil
}

// SpaceStopError checks a proposed destination without changing the pawn or RNG.
func SpaceStopError(s *domain.GameState, gd *domain.GameData, pawnID string, destinations ...SpaceRef) error {
	if s.RulesVersion == "" || gd.RegressionFixture != "" {
		return nil
	}
	pawn := s.Cybernet.PawnByID(pawnID)
	if pawn == nil {
		return fmt.Errorf("the stopping pawn is unavailable")
	}
	coord, spaceID := pawn.Coord, pawn.SpaceID
	if len(destinations) > 0 {
		coord, spaceID = destinations[0].Coord, destinations[0].SpaceID
	}
	placed := s.Cybernet.At(coord)
	if placed == nil {
		return nil
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return nil
	}
	space := block.Space(spaceID)
	if space == nil || (space.Effect == nil && space.Type != "effect") {
		return nil
	}
	if err := ValidateSpaceEffects(block); err != nil {
		return err
	}
	if space.Effect == nil {
		return fmt.Errorf("untyped effect space requires source review")
	}
	if s.PendingAttack != nil || s.PendingThreats != nil {
		return fmt.Errorf("effect-space versus threat timing is unresolved")
	}
	for _, t := range s.Threats {
		if t.Status != "eliminated" && t.Coord == coord {
			return fmt.Errorf("effect-space versus threat timing is unresolved")
		}
	}
	return nil
}

func spaceEffectContext(s *domain.GameState, gd *domain.GameData) (*domain.Space, error) {
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "space-discard" {
		return nil, fmt.Errorf("the pending stopping pawn or effect space is unavailable")
	}
	pawn := s.Cybernet.PawnByID(choice.PawnID)
	if pawn == nil || pawn.OwnerID != choice.PlayerID || choice.Reference == nil || pawn.Coord != *choice.Reference || pawn.SpaceID != choice.SpaceID {
		return nil, fmt.Errorf("the pending stopping pawn or effect space is unavailable")
	}
	placed := s.Cybernet.At(pawn.Coord)
	if placed == nil {
		return nil, fmt.Errorf("the pending effect block is unavailable")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok || block.ID != choice.BlockID {
		return nil, fmt.Errorf("the pending effect block is unavailable")
	}
	if err := ValidateSpaceEffects(block); err != nil {
		return nil, err
	}
	space := block.Space(pawn.SpaceID)
	if space == nil || space.Effect == nil {
		return nil, fmt.Errorf("the pending space effect is unavailable")
	}
	return space, nil
}

func SpaceEffectResponses(s *domain.GameState, gd *domain.GameData) ([]Action, error) {
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "space-discard" {
		return []Action{}, nil
	}
	space, err := spaceEffectContext(s, gd)
	if err != nil {
		return nil, err
	}
	base := Action{Type: ActResolveChoice, PlayerID: choice.PlayerID, ChoiceID: choice.ID, OptionID: "skip"}
	responses := []Action{base}
	seen := map[string]bool{}
	for _, pawn := range s.Cybernet.Pawns {
		for _, a := range pawn.Attachments {
			card := cardByID(gd, a.CardID)
			family := ""
			if card != nil {
				family = card.Type
				if family == "" && card.Attach != nil {
					family = card.Attach.Slot
				}
			}
			if family != space.Effect.CardType {
				continue
			}
			if a.InstanceID == "" || seen[a.InstanceID] {
				return nil, fmt.Errorf("space effects require unique physical attachment ids")
			}
			seen[a.InstanceID] = true
			response := base
			response.OptionID = "discard"
			response.TargetID = pawn.PawnID
			response.AttachmentID = a.InstanceID
			responses = append(responses, response)
		}
	}
	return responses, nil
}

// OfferSpaceEffect runs once after actual movement, not intermediate or zero steps.
func OfferSpaceEffect(s *domain.GameState, gd *domain.GameData, pawnID string) error {
	if s.RulesVersion == "" || gd.RegressionFixture != "" {
		return nil
	}
	if err := SpaceStopError(s, gd, pawnID); err != nil {
		return err
	}
	pawn := s.Cybernet.PawnByID(pawnID)
	placed := s.Cybernet.At(pawn.Coord)
	if placed == nil {
		return nil
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return nil
	}
	space := block.Space(pawn.SpaceID)
	if space == nil || space.Effect == nil {
		return nil
	}
	if s.PendingChoice != nil || s.PendingBlockDiscards != nil || s.PlayerByID(pawn.OwnerID) == nil {
		return fmt.Errorf("resolve pending work before offering a controlled space effect")
	}
	s.DecisionSerial++
	id := fmt.Sprintf("space-%d", s.DecisionSerial)
	coord := pawn.Coord
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: pawn.OwnerID, Kind: "space-discard", EffectID: id, PawnID: pawnID, BlockID: block.ID, SpaceID: pawn.SpaceID, Reference: &coord}
	_, err := SpaceEffectResponses(s, gd)
	return err
}

func ResolveSpaceEffect(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "space-discard" || a.ChoiceID != choice.ID || a.CardID != "" || len(a.CardIDs) > 0 || a.PawnID != "" || len(a.TargetIDs) > 0 || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.SlotRef != "" || a.Joint || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 {
		return fmt.Errorf("choose only the current optional space response")
	}
	responses, err := SpaceEffectResponses(s, gd)
	if err != nil {
		return err
	}
	var selected *Action
	for i := range responses {
		r := &responses[i]
		if r.OptionID == a.OptionID && r.TargetID == a.TargetID && r.AttachmentID == a.AttachmentID {
			selected = r
			break
		}
	}
	if selected == nil {
		return fmt.Errorf("choose a current physical attachment or decline the space effect")
	}
	if selected.OptionID == "discard" {
		target := s.Cybernet.PawnByID(selected.TargetID)
		for i, a := range target.Attachments {
			if a.InstanceID == selected.AttachmentID {
				DiscardPawnAttachment(s, gd, target, i, events)
				break
			}
		}
	}
	s.PendingChoice = nil
	return nil
}
