package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type BonusPool struct {
	Supply   int `json:"supply"`
	Reserve  int `json:"reserve"`
	Free     int `json:"free"`
	Invested int `json:"invested"`
	OnBoard  int `json:"onBoard"`
}

// Reserve is derived from public physical allocations, never a second mutable balance.
func BonusCounterPool(s *domain.GameState) (*BonusPool, error) {
	if s.BonusCounterSupply == nil {
		return nil, nil
	}
	p := &BonusPool{Supply: *s.BonusCounterSupply}
	if p.Supply < 0 {
		return nil, fmt.Errorf("invalid physical bonus-counter allocation")
	}
	for _, owner := range s.Players {
		if owner.BonusCounters < 0 {
			return nil, fmt.Errorf("invalid physical bonus-counter allocation")
		}
		p.Free += owner.BonusCounters
	}
	add := func(atts []domain.Attachment) error {
		for _, a := range atts {
			if a.BonusPaid < 0 {
				return fmt.Errorf("invalid physical bonus-counter allocation")
			}
			p.Invested += a.BonusPaid
		}
		return nil
	}
	for _, pawn := range s.Cybernet.Pawns {
		if err := add(pawn.Attachments); err != nil {
			return nil, err
		}
	}
	for _, b := range s.Cybernet.Blocks {
		if err := add(b.Attachments); err != nil {
			return nil, err
		}
	}
	for _, icon := range s.Cybernet.BonusIcons {
		if icon.CounterPlaced && icon.CollectedBy != "" || !icon.CounterPlaced && icon.CollectedBy == "" {
			return nil, fmt.Errorf("a source bonus icon needs exactly one uncollected physical counter")
		}
		if icon.CounterPlaced {
			p.OnBoard++
		}
	}
	for _, block := range s.Cybernet.Blocks {
		if block.BonusCounter != nil {
			if block.BonusCounter.CollectedBy != "" && s.PlayerByID(block.BonusCounter.CollectedBy) == nil {
				return nil, fmt.Errorf("invalid physical block bonus-counter allocation")
			}
			if block.BonusCounter.CollectedBy == "" {
				p.OnBoard++
			}
		}
	}
	p.Reserve = p.Supply - p.Free - p.Invested - p.OnBoard
	if p.Reserve < 0 {
		return nil, fmt.Errorf("physical bonus-counter allocations exceed the configured supply")
	}
	return p, nil
}
func RequireBonusReserve(s *domain.GameState, amount int) error {
	if amount < 0 {
		return fmt.Errorf("invalid bonus-counter award amount")
	}
	if amount == 0 {
		return nil
	}
	p, err := BonusCounterPool(s)
	if err != nil {
		return err
	}
	if p == nil && s.RulesVersion != "" {
		return fmt.Errorf("source bonus awards require a configured physical supply")
	}
	if p != nil && p.Reserve < amount {
		return fmt.Errorf("bonus reserve shortfall is unresolved; preserve the accepted resolution window")
	}
	return nil
}
func GrantBonusCounters(s *domain.GameState, playerID string, amount int) error {
	p := s.PlayerByID(playerID)
	if p == nil {
		return fmt.Errorf("unknown bonus-counter recipient")
	}
	if err := RequireBonusReserve(s, amount); err != nil {
		return err
	}
	p.BonusCounters += amount
	return nil
}
func ValidateGlobalBonusEffect(block *domain.Block, strict bool) error {
	for _, entry := range []struct {
		trigger string
		e       *domain.BlockEffect
	}{{"inCybernet", block.Effects.InCybernet}, {"underControl", block.Effects.UnderControl}} {
		e := entry.e
		if e == nil || e.Kind != "gain-bonus-all-players" {
			continue
		}
		if entry.trigger != "inCybernet" || e.Amount < 1 || e.Target != "" || e.MinimumControlledPawns != 0 {
			return fmt.Errorf("unsupported all-player bonus award descriptor")
		}
		if strict {
			return fmt.Errorf("global bonus reserve shortfall policy remains unresolved in official content")
		}
	}
	return nil
}
