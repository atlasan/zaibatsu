package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateBlockDetach(block *domain.Block) error {
	for i, e := range []*domain.BlockEffect{block.Effects.InCybernet, block.Effects.UnderControl} {
		if e == nil || e.Kind != "discard-pawn-attachments" {
			continue
		}
		if i != 1 || e.Scope != "cybernet" || e.Optional || e.Amount != 0 || e.Target != "" || e.MarkerThreshold != 0 || e.MinimumControlledPawns != 0 {
			return fmt.Errorf("pawn detachment requires mandatory under-control timing and Cybernet scope without extra costs or targets")
		}
	}
	return nil
}
func BeginBlockDetach(s *domain.GameState, gd *domain.GameData, coord domain.Coord) error {
	placed := s.Cybernet.At(coord)
	if s.RulesVersion == "" || placed == nil || s.PlayerByID(placed.OwnerID) == nil {
		return fmt.Errorf("pawn detachment requires a controlled source block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return fmt.Errorf("unknown source block")
	}
	if err := ValidateBlockDetach(block); err != nil {
		return err
	}
	if block.Effects.UnderControl == nil || block.Effects.UnderControl.Kind != "discard-pawn-attachments" {
		return fmt.Errorf("pawn detachment source is unavailable")
	}
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil || len(s.PendingEliminations) > 0 {
		return fmt.Errorf("finish pending resolution before opening pawn detachment")
	}
	s.DecisionSerial++
	id := fmt.Sprintf("block-detach-%d", s.DecisionSerial)
	origin := coord
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: placed.OwnerID, Kind: "block-detach", EffectID: id, BlockID: block.ID, Reference: &origin}
	return nil
}
func BlockDetachResponses(s *domain.GameState, gd *domain.GameData) []Action {
	out := []Action{}
	c := s.PendingChoice
	if c == nil || c.Kind != "block-detach" || c.Reference == nil || c.BlockID == "" {
		return out
	}
	placed := s.Cybernet.At(*c.Reference)
	if placed == nil || placed.BlockID != c.BlockID || placed.OwnerID != c.PlayerID {
		return out
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok || block.Effects.UnderControl == nil || block.Effects.UnderControl.Kind != "discard-pawn-attachments" || ValidateBlockDetach(block) != nil {
		return out
	}
	for _, p := range s.Cybernet.Pawns {
		_, known := gd.PawnByID(p.PawnID)
		tile := s.Cybernet.At(p.Coord)
		if !known || tile == nil {
			continue
		}
		if _, ok := gd.BlockByID(tile.BlockID); !ok {
			continue
		}
		out = append(out, Action{Type: ActResolveChoice, PlayerID: c.PlayerID, ChoiceID: c.ID, OptionID: "discard", TargetID: p.PawnID})
	}
	return out
}
func ResolveBlockDetach(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	c := s.PendingChoice
	if c == nil || c.Kind != "block-detach" || a.ChoiceID != c.ID || a.CardID != "" || len(a.CardIDs) > 0 || len(a.TargetIDs) > 0 || a.PawnID != "" || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.AttachmentID != "" || a.SlotRef != "" || a.Joint || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 {
		return fmt.Errorf("choose one current Cybernet pawn without another action, attachment selection or cost")
	}
	if !slices.ContainsFunc(BlockDetachResponses(s, gd), func(r Action) bool { return r.OptionID == a.OptionID && r.TargetID == a.TargetID }) {
		return fmt.Errorf("choose a current pawn in Cybernet; this mandatory effect cannot be declined")
	}
	target := s.Cybernet.PawnByID(a.TargetID)
	cards := []string{}
	for _, att := range target.Attachments {
		cards = append(cards, att.CardID)
	}
	if events != nil {
		*events = append(*events, EngineEvent{Type: "block-attachments-discarded", PlayerID: c.PlayerID, PawnID: target.PawnID, Amount: len(cards), Element: "block", ElementID: c.BlockID})
	}
	discardAttachments(s, target)
	if events != nil {
		for _, id := range cards {
			*events = append(*events, EngineEvent{Type: "card-discarded", CardID: id})
		}
	}
	s.PendingChoice = nil
	return nil
}
