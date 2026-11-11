package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateBlockAttack(block *domain.Block) error {
	for _, entry := range []struct {
		name string
		e    *domain.BlockEffect
	}{{"inCybernet", block.Effects.InCybernet}, {"underControl", block.Effects.UnderControl}} {
		e := entry.e
		if e == nil {
			continue
		}
		if e.Kind != "attack-pawn" {
			if e.Scope != "" && e.Kind != "discard-pawn-attachments" || e.Optional {
				return fmt.Errorf("block attack scope/optionality belongs only to a targeted attack")
			}
			continue
		}
		if entry.name != "underControl" || e.Scope != "adjacent-blocks" || !e.Optional || e.Amount < 1 || e.Target != "" || e.MinimumControlledPawns != 0 {
			return fmt.Errorf("targeted block attack requires under-control timing, adjacent scope, optional choice and positive skulls")
		}
	}
	return nil
}
func BeginBlockAttack(s *domain.GameState, gd *domain.GameData, coord domain.Coord, e *domain.BlockEffect) error {
	placed := s.Cybernet.At(coord)
	if s.RulesVersion == "" || placed == nil || s.PlayerByID(placed.OwnerID) == nil {
		return fmt.Errorf("block attack requires a controlled source block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return fmt.Errorf("unknown source block")
	}
	if err := ValidateBlockAttack(block); err != nil {
		return err
	}
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil || len(s.PendingEliminations) > 0 {
		return fmt.Errorf("finish pending resolution before opening a block attack")
	}
	s.DecisionSerial++
	id := fmt.Sprintf("block-attack-%d", s.DecisionSerial)
	c := coord
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: placed.OwnerID, Kind: "block-attack", EffectID: id, Amount: e.Amount, BlockID: block.ID, Reference: &c}
	return nil
}
func BlockAttackResponses(s *domain.GameState, gd *domain.GameData) []Action {
	out := []Action{}
	c := s.PendingChoice
	if c == nil || c.Kind != "block-attack" || c.Reference == nil || c.BlockID == "" {
		return out
	}
	placed := s.Cybernet.At(*c.Reference)
	if placed == nil || placed.BlockID != c.BlockID || placed.OwnerID != c.PlayerID {
		return out
	}
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return out
	}
	e := block.Effects.UnderControl
	if e == nil || e.Kind != "attack-pawn" || e.Scope != "adjacent-blocks" || !e.Optional || e.Amount != c.Amount {
		return out
	}
	base := Action{Type: ActResolveChoice, PlayerID: c.PlayerID, ChoiceID: c.ID, OptionID: "skip"}
	out = append(out, base)
	for _, p := range s.Cybernet.Pawns {
		if _, ok := gd.PawnByID(p.PawnID); !ok {
			continue
		}
		b := s.Cybernet.At(p.Coord)
		if b == nil {
			continue
		}
		if _, ok := gd.BlockByID(b.BlockID); !ok {
			continue
		}
		adjacent := false
		for d := 0; d < 6; d++ {
			if c.Reference.Neighbor(d) == p.Coord {
				adjacent = true
			}
		}
		if adjacent {
			a := base
			a.OptionID = "attack"
			a.TargetID = p.PawnID
			out = append(out, a)
		}
	}
	return out
}
func ResolveBlockAttack(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	c := s.PendingChoice
	if c == nil || c.Kind != "block-attack" || a.ChoiceID != c.ID || a.CardID != "" || len(a.CardIDs) > 0 || len(a.TargetIDs) > 0 || a.PawnID != "" || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.Joint || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 {
		return fmt.Errorf("choose a current block attack target or decline without another action/cost")
	}
	if !slices.ContainsFunc(BlockAttackResponses(s, gd), func(r Action) bool { return r.OptionID == a.OptionID && r.TargetID == a.TargetID }) {
		return fmt.Errorf("select one pawn on an adjacent block or decline")
	}
	if a.OptionID == "skip" {
		s.PendingChoice = nil
		return nil
	}
	target := s.Cybernet.PawnByID(a.TargetID)
	defense, err := DefenseProfile(s, gd, target)
	if err != nil {
		return err
	}
	roll := AttackRoll(s.RNG, c.Amount)
	origin := *c.Reference
	*events = append(*events, EngineEvent{Type: "block-attack-targeted", PlayerID: c.PlayerID, PawnID: target.PawnID, Element: "block", ElementID: c.BlockID, Coord: &origin}, EngineEvent{Type: EventRoll, PlayerID: c.PlayerID, ActionType: ActResolveChoice, Element: "block", ElementID: c.BlockID, Roll: roll})
	s.PendingChoice = nil
	if Defeats(roll, defense) {
		_, err = attemptEliminatePawn(s, gd, target.PawnID, "attack", events)
	}
	return err
}
