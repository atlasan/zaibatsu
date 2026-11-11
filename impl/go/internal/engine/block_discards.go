package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ControlledPawnCount(s *domain.GameState, playerID string) int {
	ids := map[string]bool{}
	for _, p := range s.Cybernet.Pawns {
		if p.OwnerID == playerID {
			ids[p.PawnID] = true
		}
	}
	for _, c := range s.ControlCards {
		if c.Subject.Kind == "pawn" && c.Zone == "control" && c.OwnerID == playerID {
			ids[c.Subject.ID] = true
		}
	}
	return len(ids)
}

func BlockDiscardChoice(s *domain.GameState, id string) *domain.PendingChoice {
	batch := s.PendingBlockDiscards
	if batch == nil {
		return nil
	}
	for _, d := range batch.Decisions {
		if d.ID == id && !d.Submitted {
			return &domain.PendingChoice{ID: d.ID, PlayerID: d.PlayerID, Kind: "block-discard", EffectID: "block:" + batch.BlockID, Amount: d.Amount, BlockID: batch.BlockID}
		}
	}
	return nil
}

func BeginBlockDiscards(s *domain.GameState, gd *domain.GameData, coord domain.Coord) error {
	if s.RulesVersion == "" || s.PendingChoice != nil || s.PendingBlockDiscards != nil || s.PendingPhase != "" || s.PendingAttack != nil || s.PendingThreats != nil {
		return fmt.Errorf("block discard requires an independent source resolution window")
	}
	block := s.Cybernet.At(coord)
	if block == nil {
		return fmt.Errorf("block discard requires a placed block")
	}
	serial := s.DecisionSerial + 1
	decisions := []domain.BlockDiscardDecision{}
	for _, p := range s.Players {
		amount := ControlledPawnCount(s, p.ID)
		if len(p.Hand) < amount {
			return fmt.Errorf("Sprawl hand shortfall is unresolved; preserve the pending Search placement for source review")
		}
		if amount > 0 {
			decisions = append(decisions, domain.BlockDiscardDecision{ID: fmt.Sprintf("block:%d:%s", serial, p.ID), PlayerID: p.ID, Amount: amount})
		}
	}
	if len(decisions) == 0 {
		return nil
	}
	s.DecisionSerial = serial
	s.PendingBlockDiscards = &domain.PendingBlockDiscards{BlockID: block.BlockID, Coord: coord, Decisions: decisions}
	s.PendingChoice = BlockDiscardChoice(s, decisions[0].ID)
	return nil
}

func selectedBlockCards(hand, requested []string, amount int) ([]string, error) {
	if len(requested) != amount {
		return nil, fmt.Errorf("choose exactly %d physical hand card(s) to discard", amount)
	}
	wanted := append([]string{}, requested...)
	selected := []string{}
	for _, id := range hand {
		if i := slices.Index(wanted, id); i >= 0 {
			selected = append(selected, id)
			wanted = append(wanted[:i], wanted[i+1:]...)
		}
	}
	if len(wanted) > 0 {
		return nil, fmt.Errorf("a selected physical hand card is unavailable")
	}
	return selected, nil
}

func ResolveBlockDiscard(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	batch, choice := s.PendingBlockDiscards, BlockDiscardChoice(s, a.ChoiceID)
	playerID := a.PlayerID
	if playerID == "" {
		playerID = s.CurrentPlayerPtr().ID
	}
	if batch == nil || choice == nil || playerID != choice.PlayerID || a.OptionID != "discard" || a.CardID != "" || a.TargetID != "" || len(a.TargetIDs) > 0 || a.PawnID != "" || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.SlotRef != "" || a.Joint || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 {
		return fmt.Errorf("choose only your required physical hand cards for the current block decision")
	}
	owner := s.PlayerByID(choice.PlayerID)
	for i := range batch.Decisions {
		d := &batch.Decisions[i]
		if d.ID == choice.ID {
			cards, err := selectedBlockCards(owner.Hand, a.CardIDs, d.Amount)
			if err != nil {
				return err
			}
			d.CardIDs = cards
			d.Submitted = true
		}
	}
	for _, d := range batch.Decisions {
		if !d.Submitted {
			s.PendingChoice = BlockDiscardChoice(s, d.ID)
			return nil
		}
	}
	selections := [][]string{}
	for _, d := range batch.Decisions {
		cards, err := selectedBlockCards(s.PlayerByID(d.PlayerID).Hand, d.CardIDs, d.Amount)
		if err != nil {
			return err
		}
		selections = append(selections, cards)
	}
	for i, d := range batch.Decisions {
		p := s.PlayerByID(d.PlayerID)
		for _, cardID := range selections[i] {
			at := slices.Index(p.Hand, cardID)
			p.Hand = append(p.Hand[:at], p.Hand[at+1:]...)
			s.Discard = append(s.Discard, cardID)
			*events = append(*events, EngineEvent{Type: "card-discarded", PlayerID: d.PlayerID, CardID: cardID})
		}
	}
	s.PendingChoice = nil
	s.PendingBlockDiscards = nil
	return DeployThreats(s, gd, batch.Coord)
}
