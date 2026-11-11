package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidatePawnPhaseEffects(pawn *domain.Pawn, gd *domain.GameData, strict ...bool) error {
	if len(strict) > 0 && strict[0] && len(pawn.PhaseEffects) > 0 {
		return fmt.Errorf("native phase-effect ordering is unresolved in official content")
	}
	if len(pawn.PhaseEffects) > 1 {
		return fmt.Errorf("unsupported multiple native pawn phase effects")
	}
	for _, e := range pawn.PhaseEffects {
		if e.Trigger != "begin-turn" || e.Kind != "steal-random-card" || e.Amount != 1 || e.Scope != "cybernet" || e.Target != "another-pawn" || !e.Optional {
			return fmt.Errorf("unsupported native pawn phase effect")
		}
		count := 0
		for _, c := range gd.ControlCards {
			if c.Subject.Kind == "pawn" && c.Subject.ID == pawn.ID {
				count++
			}
		}
		if count != 1 {
			return fmt.Errorf("native pawn phase effects require one physical control card")
		}
	}
	return nil
}
func PawnPhaseEffects(s *domain.GameState, gd *domain.GameData, phase string) ([]domain.PendingEffect, error) {
	out := []domain.PendingEffect{}
	if phase != "beginning" {
		return out, nil
	}
	for _, p := range s.Cybernet.Pawns {
		if p.OwnerID != s.CurrentPlayerPtr().ID {
			continue
		}
		pawn, ok := gd.PawnByID(p.PawnID)
		if !ok {
			continue
		}
		if err := ValidatePawnPhaseEffects(pawn, gd); err != nil {
			return nil, err
		}
		for i, e := range pawn.PhaseEffects {
			out = append(out, domain.PendingEffect{PhaseEffect: domain.PhaseEffect{Trigger: e.Trigger, Kind: e.Kind, Amount: e.Amount}, ID: fmt.Sprintf("%d:%s:%s:native:%d", s.Turn, phase, p.PawnID, i), PlayerID: p.OwnerID, PawnID: p.PawnID, Source: "pawn", Scope: e.Scope, Target: e.Target, Optional: e.Optional})
		}
	}
	return out, nil
}
func PawnPhaseSourceAvailable(s *domain.GameState, gd *domain.GameData, e domain.PendingEffect) bool {
	p := s.Cybernet.PawnByID(e.PawnID)
	if e.Kind != "steal-random-card" || e.Amount != 1 || e.Scope != "cybernet" || e.Target != "another-pawn" || !e.Optional || p == nil || p.OwnerID != e.PlayerID {
		return false
	}
	pawn, ok := gd.PawnByID(e.PawnID)
	if !ok {
		return false
	}
	controlled := false
	for _, c := range s.ControlCards {
		if c.Subject.Kind == "pawn" && c.Subject.ID == e.PawnID && c.Zone == "control" && c.OwnerID == e.PlayerID {
			controlled = true
		}
	}
	return controlled && slices.ContainsFunc(pawn.PhaseEffects, func(p domain.PawnPhaseEffect) bool { return p.Kind == e.Kind && p.Trigger == e.Trigger })
}
func PawnTheftResponses(s *domain.GameState, gd *domain.GameData) []Action {
	out := []Action{}
	c := s.PendingChoice
	if s.Phase != domain.PhaseBeginning || s.PendingPhase != "beginning" || c == nil || c.PlayerID != s.CurrentPlayerPtr().ID || c.Kind != "steal-card" || len(s.PendingEffects) == 0 {
		return out
	}
	e := s.PendingEffects[0]
	if e.Source != "pawn" || c.EffectID != e.ID || !PawnPhaseSourceAvailable(s, gd, e) {
		return out
	}
	base := Action{Type: ActResolveChoice, ChoiceID: c.ID, PlayerID: c.PlayerID, OptionID: "skip"}
	out = append(out, base)
	for _, p := range s.Cybernet.Pawns {
		if p.PawnID == c.PawnID {
			continue
		}
		if _, ok := gd.PawnByID(p.PawnID); !ok {
			continue
		}
		owner := s.PlayerByID(p.OwnerID)
		if owner == nil || len(owner.Hand) == 0 {
			continue
		}
		a := base
		a.OptionID = "steal"
		a.TargetID = p.PawnID
		out = append(out, a)
	}
	return out
}
func ResolvePawnTheft(s *domain.GameState, gd *domain.GameData, a Action, events *[]EngineEvent) error {
	c := s.PendingChoice
	if c == nil || c.Kind != "steal-card" || a.ChoiceID != c.ID || len(s.PendingEffects) == 0 {
		return fmt.Errorf("unknown or stale pawn theft choice")
	}
	e := s.PendingEffects[0]
	if e.Source != "pawn" || e.Kind != "steal-random-card" || !PawnPhaseSourceAvailable(s, gd, e) {
		return fmt.Errorf("unknown or stale pawn theft choice")
	}
	if a.CardID != "" || len(a.CardIDs) > 0 || len(a.TargetIDs) > 0 || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || a.PawnID != "" && a.PawnID != c.PawnID || a.MovementIndex != 0 || a.Dir != 0 || a.Rotation != 0 || a.ExtraSkulls != 0 || a.ExtraRollDice != 0 || a.Joint {
		return fmt.Errorf("a pawn theft cannot spend cards, move or change its source")
	}
	if !slices.ContainsFunc(PawnTheftResponses(s, gd), func(r Action) bool { return r.OptionID == a.OptionID && r.TargetID == a.TargetID }) {
		return fmt.Errorf("select a current pawn theft target or decline")
	}
	if a.OptionID == "steal" {
		target := s.Cybernet.PawnByID(a.TargetID)
		from := s.PlayerByID(target.OwnerID)
		to := s.PlayerByID(c.PlayerID)
		at := s.RNG.Intn(len(from.Hand))
		cardID := from.Hand[at]
		from.Hand = slices.Delete(from.Hand, at, at+1)
		to.Hand = append(to.Hand, cardID)
		*events = append(*events, EngineEvent{Type: "card-stolen", PlayerID: to.ID, PawnID: c.PawnID, Element: "pawn", ElementID: target.PawnID, FromOwnerID: from.ID, ToOwnerID: to.ID, CardID: cardID, CardRevealed: ControllerHandRevealed(s, gd, from.ID) || ControllerHandRevealed(s, gd, to.ID)})
	}
	s.PendingChoice = nil
	s.PendingEffects = s.PendingEffects[1:]
	return nil
}
