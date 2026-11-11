package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateBlockSacrifices(block *domain.Block, strict bool) error {
	for _, entry := range []struct {
		trigger string
		effect  *domain.BlockEffect
	}{{"inCybernet", block.Effects.InCybernet}, {"underControl", block.Effects.UnderControl}} {
		e := entry.effect
		if e == nil {
			continue
		}
		if e.Kind != "sacrifice-per-player" {
			if e.MinimumControlledPawns != 0 {
				return fmt.Errorf("a sacrifice threshold requires a sacrifice-per-player effect")
			}
			continue
		}
		if entry.trigger != "inCybernet" || e.Amount != 1 || e.MinimumControlledPawns < 1 || e.Target != "" {
			return fmt.Errorf("unsupported per-player sacrifice descriptor")
		}
		if strict {
			return fmt.Errorf("global sacrifice ordering and retained-pawn eligibility remain unresolved in official content")
		}
	}
	return nil
}
func BlockSacrificeChoice(s *domain.GameState, id string) *domain.PendingChoice {
	batch := s.PendingBlockSacrifices
	if batch == nil {
		return nil
	}
	for _, d := range batch.Decisions {
		if d.ID == id && !d.Submitted {
			return &domain.PendingChoice{ID: d.ID, PlayerID: d.PlayerID, Kind: "block-sacrifice", EffectID: "block:" + batch.BlockID, Amount: 1, BlockID: batch.BlockID}
		}
	}
	return nil
}
func BeginBlockSacrifices(s *domain.GameState, gd *domain.GameData, coord domain.Coord, effect *domain.BlockEffect) error {
	if s.RulesVersion == "" || s.PendingChoice != nil || s.PendingBlockDiscards != nil || s.PendingBlockSacrifices != nil || s.PendingPhase != "" || s.PendingAttack != nil || s.PendingThreats != nil {
		return fmt.Errorf("block sacrifice requires an independent source resolution window")
	}
	placed := s.Cybernet.At(coord)
	if placed == nil {
		return fmt.Errorf("block sacrifice requires a placed block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return fmt.Errorf("block sacrifice requires a placed block")
	}
	if err := ValidateBlockSacrifices(block, false); err != nil {
		return err
	}
	if effect == nil || effect.Kind != "sacrifice-per-player" || effect.Amount != 1 || effect.MinimumControlledPawns < 1 {
		return fmt.Errorf("unsupported per-player sacrifice descriptor")
	}
	serial := s.DecisionSerial + 1
	decisions := []domain.BlockSacrificeDecision{}
	for _, p := range s.Players {
		if ControlledPawnCount(s, p.ID) < effect.MinimumControlledPawns {
			continue
		}
		ids := []string{}
		for _, pawn := range s.Cybernet.Pawns {
			if pawn.OwnerID == p.ID {
				ids = append(ids, pawn.PawnID)
			}
		}
		slices.Sort(ids)
		if len(ids) == 0 {
			return fmt.Errorf("sacrificing an already eliminated retained pawn is unresolved; preserve the pending Search placement")
		}
		decisions = append(decisions, domain.BlockSacrificeDecision{ID: fmt.Sprintf("sacrifice:%d:%s", serial, p.ID), PlayerID: p.ID, CandidatePawnIDs: ids})
	}
	if len(decisions) == 0 {
		return nil
	}
	s.DecisionSerial = serial
	s.PendingBlockSacrifices = &domain.PendingBlockSacrifices{BlockID: placed.BlockID, Coord: coord, Decisions: decisions}
	s.PendingChoice = BlockSacrificeChoice(s, decisions[0].ID)
	return nil
}

type UnresolvedSacrificeTarget struct {
	PawnID string `json:"pawnId"`
	Reason string `json:"reason"`
}

func BlockSacrificeOptions(s *domain.GameState, gd *domain.GameData, id string) ([]Action, []UnresolvedSacrificeTarget) {
	responses, unresolved := []Action{}, []UnresolvedSacrificeTarget{}
	choice := BlockSacrificeChoice(s, id)
	if choice == nil {
		return responses, unresolved
	}
	for _, d := range s.PendingBlockSacrifices.Decisions {
		if d.ID != id {
			continue
		}
		for _, pawnID := range d.CandidatePawnIDs {
			pawn := s.Cybernet.PawnByID(pawnID)
			if pawn == nil || pawn.OwnerID != choice.PlayerID {
				continue
			}
			if len(PreventionCards(s, gd, pawnID)) > 0 {
				unresolved = append(unresolved, UnresolvedSacrificeTarget{PawnID: pawnID, Reason: "sacrifice versus elimination prevention remains unresolved"})
			} else {
				responses = append(responses, Action{Type: ActResolveChoice, PlayerID: choice.PlayerID, ChoiceID: choice.ID, OptionID: "sacrifice", TargetID: pawnID})
			}
		}
	}
	return responses, unresolved
}
func ResolveBlockSacrifice(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	batch, choice := s.PendingBlockSacrifices, BlockSacrificeChoice(s, a.ChoiceID)
	playerID := a.PlayerID
	if playerID == "" {
		playerID = s.CurrentPlayerPtr().ID
	}
	if batch == nil || choice == nil || playerID != choice.PlayerID || a.OptionID != "sacrifice" || a.TargetID == "" || a.CardID != "" || len(a.CardIDs) > 0 || a.PawnID != "" || len(a.TargetIDs) > 0 || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.SlotRef != "" || a.AttachmentID != "" || a.Joint || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 {
		return fmt.Errorf("choose one currently controlled pawn for your required sacrifice")
	}
	responses, unresolved := BlockSacrificeOptions(s, gd, choice.ID)
	for _, target := range unresolved {
		if target.PawnID == a.TargetID {
			return fmt.Errorf("sacrifice versus elimination prevention remains unresolved")
		}
	}
	valid := false
	for _, response := range responses {
		valid = valid || response.TargetID == a.TargetID
	}
	if !valid {
		return fmt.Errorf("choose one currently controlled pawn for your required sacrifice")
	}
	for i := range batch.Decisions {
		d := &batch.Decisions[i]
		if d.ID == choice.ID {
			d.PawnID = a.TargetID
			d.Submitted = true
			*events = append(*events, EngineEvent{Type: EventPawnSacrificeSelected, PlayerID: d.PlayerID, PawnID: d.PawnID, ElementID: batch.BlockID})
		}
	}
	for _, d := range batch.Decisions {
		if !d.Submitted {
			s.PendingChoice = BlockSacrificeChoice(s, d.ID)
			return nil
		}
	}
	// Revalidate every public commitment before any elimination/refund.
	for _, d := range batch.Decisions {
		pawn := s.Cybernet.PawnByID(d.PawnID)
		if pawn == nil || pawn.OwnerID != d.PlayerID || !slices.Contains(d.CandidatePawnIDs, pawn.PawnID) {
			return fmt.Errorf("a committed sacrifice pawn is no longer available")
		}
		if len(PreventionCards(s, gd, pawn.PawnID)) > 0 {
			return fmt.Errorf("sacrifice versus elimination prevention remains unresolved")
		}
	}
	for _, d := range batch.Decisions {
		if _, err := attemptEliminatePawn(s, gd, d.PawnID, "sacrifice", events); err != nil {
			return err
		}
	}
	s.PendingChoice = nil
	s.PendingBlockSacrifices = nil
	return DeployThreats(s, gd, batch.Coord)
}
