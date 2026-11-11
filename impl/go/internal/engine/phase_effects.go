package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func discardPhaseSource(s *domain.GameState, gd *domain.GameData, e domain.PendingEffect, events *[]EngineEvent) {
	pawn := s.Cybernet.PawnByID(e.PawnID)
	if pawn == nil {
		return
	}
	for i, att := range pawn.Attachments {
		if att.CardID == e.CardID {
			DiscardPawnAttachment(s, gd, pawn, i, events)
			return
		}
	}
}

func phaseEventSink(sinks []*[]EngineEvent) *[]EngineEvent {
	if len(sinks) > 0 && sinks[0] != nil {
		return sinks[0]
	}
	events := []EngineEvent{}
	return &events
}

func sacrificePhasePawn(s *domain.GameState, gd *domain.GameData, pawnID string, events *[]EngineEvent) error {
	_, err := attemptEliminatePawn(s, gd, pawnID, "sacrifice", events)
	return err
}

func finishPhaseEffects(s *domain.GameState) {
	if s.PendingAttack != nil || s.PendingThreats != nil {
		return
	}
	if s.PendingPhase == "beginning" {
		ClearControlledUseMarkers(s, s.CurrentPlayerPtr().ID)
		s.CurrentPlayerPtr().OncePerTurnUsed = map[string]bool{}
		ResetThreats(s)
		s.Phase = domain.PhaseAction
	} else {
		s.Phase = domain.PhaseRecycle
	}
	s.PendingPhase = ""
	s.PendingEffects = nil
	s.PendingChoice = nil
}

func drainPhaseEffects(s *domain.GameState, gd *domain.GameData, events *[]EngineEvent) error {
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil {
		return nil
	}
	for len(s.PendingEffects) > 0 {
		effect := s.PendingEffects[0]
		pawn := s.Cybernet.PawnByID(effect.PawnID)
		attached := false
		if pawn != nil && pawn.OwnerID == effect.PlayerID {
			for _, att := range pawn.Attachments {
				if att.CardID == effect.CardID {
					attached = true
				}
			}
		}
		if effect.Source == "pawn" {
			attached = PawnPhaseSourceAvailable(s, gd, effect)
		}
		if !attached {
			s.PendingEffects = s.PendingEffects[1:]
			continue
		}
		owner := s.PlayerByID(effect.PlayerID)
		if effect.Source == "pawn" {
			s.PendingChoice = &domain.PendingChoice{ID: effect.ID, PlayerID: owner.ID, Kind: "steal-card", EffectID: effect.ID, PawnID: effect.PawnID, Amount: effect.Amount}
			return nil
		}
		choiceKind := effect.Kind
		if choiceKind == "discard-and-relocate" {
			choiceKind = "relocate-pawn"
		}
		if choiceKind == "discard-or-sacrifice" || choiceKind == "relocate-pawn" || choiceKind == "discard-cards" {
			s.PendingChoice = &domain.PendingChoice{ID: effect.ID, PlayerID: owner.ID, Kind: choiceKind, Amount: effect.Amount, EffectID: effect.ID, PawnID: effect.PawnID, CardID: effect.CardID}
			return nil
		}
		if effect.Kind == "discard-self" {
			discardPhaseSource(s, gd, effect, events)
		} else if effect.Kind == "discard-hand" {
			for _, id := range owner.Hand {
				*events = append(*events, EngineEvent{Type: "card-discarded", CardID: id})
			}
			s.Discard = append(s.Discard, owner.Hand...)
			owner.Hand = []string{}
		} else if effect.Kind == "sacrifice-and-draw" {
			if err := sacrificePhasePawn(s, gd, effect.PawnID, events); err != nil {
				return err
			}
			for i := 0; i < effect.Amount; i++ {
				cardID, ok := draw(s)
				if !ok {
					break
				}
				owner.Hand = append(owner.Hand, cardID)
				*events = append(*events, EngineEvent{Type: EventDraw, PlayerID: owner.ID, CardID: cardID})
			}
		} else {
			return fmt.Errorf("unsupported phase effect %q", effect.Kind)
		}
		s.PendingEffects = s.PendingEffects[1:]
	}
	finishPhaseEffects(s)
	return nil
}

// ResumePhaseEffects continues after a choice or combat interruption.
func ResumePhaseEffects(s *domain.GameState, gd *domain.GameData, sinks ...*[]EngineEvent) error {
	events := phaseEventSink(sinks)
	if s.PendingPhase != "" && s.PendingChoice == nil && s.PendingAttack == nil && s.PendingThreats == nil {
		return drainPhaseEffects(s, gd, events)
	}
	return nil
}

// ValidatePhaseEffect rejects unsupported definitions before execution.
func ValidatePhaseEffect(effect domain.PhaseEffect) error {
	if effect.Trigger != "begin-turn" && effect.Trigger != "end-action" {
		return fmt.Errorf("unsupported phase trigger %q", effect.Trigger)
	}
	switch effect.Kind {
	case "discard-self", "discard-hand", "discard-or-sacrifice", "sacrifice-and-draw", "discard-and-relocate", "discard-cards":
	default:
		return fmt.Errorf("unsupported phase effect %q", effect.Kind)
	}
	counted := effect.Kind == "sacrifice-and-draw" || effect.Kind == "discard-cards"
	if counted && effect.Amount < 1 {
		return fmt.Errorf("phase effect requires a positive card amount")
	}
	if !counted && effect.Amount != 0 {
		return fmt.Errorf("this phase effect cannot carry a card amount")
	}
	if effect.ThreatMode != "" && (effect.Kind != "discard-and-relocate" || effect.ThreatMode != "normal-movement" && effect.ThreatMode != "placement") {
		return fmt.Errorf("unsupported relocation threat policy")
	}
	return nil
}

// StartPhaseEffects rejects unresolved simultaneous ordering without mutating state.
func StartPhaseEffects(s *domain.GameState, gd *domain.GameData, phase string, sinks ...*[]EngineEvent) error {
	events := phaseEventSink(sinks)
	if s.PendingChoice != nil || s.PendingPhase != "" {
		return fmt.Errorf("resolve the pending decision first")
	}
	trigger := "begin-turn"
	if phase == "action" {
		trigger = "end-action"
	}
	effects, err := PawnPhaseEffects(s, gd, phase)
	if err != nil {
		return err
	}
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.OwnerID != s.CurrentPlayerPtr().ID {
			continue
		}
		for index, att := range pawn.Attachments {
			card := cardByID(gd, att.CardID)
			if card == nil || card.Attach == nil {
				continue
			}
			for effectIndex, effect := range card.Attach.PhaseEffects {
				if effect.Trigger == trigger {
					if err := ValidatePhaseEffect(effect); err != nil {
						return err
					}
					if effect.Kind == "discard-cards" && len(s.CurrentPlayerPtr().Hand) < effect.Amount {
						return fmt.Errorf("forced discard shortfall interpretation is unresolved; this combination remains provisional")
					}
					effects = append(effects, domain.PendingEffect{PhaseEffect: effect, ID: fmt.Sprintf("%d:%s:%s:%d:%d", s.Turn, phase, pawn.PawnID, index, effectIndex), PlayerID: pawn.OwnerID, PawnID: pawn.PawnID, CardID: att.CardID})
				}
			}
		}
	}
	if len(effects) > 1 {
		return fmt.Errorf("multiple phase-effect ordering is unresolved; this combination remains provisional")
	}
	s.PendingPhase = phase
	s.PendingEffects = effects
	return drainPhaseEffects(s, gd, events)
}

func threatening(s *domain.GameState, coord domain.Coord) bool {
	for _, t := range s.Threats {
		if t.Coord == coord && t.Status != "eliminated" {
			return true
		}
	}
	return false
}

// PhaseChoiceTargets returns copied destinations without changing state or RNG.
func PhaseChoiceTargets(s *domain.GameState, gd *domain.GameData) []SpaceRef {
	targets := []SpaceRef{}
	if s.PendingChoice == nil || s.PendingChoice.Kind != "relocate-pawn" || len(s.PendingEffects) == 0 {
		return targets
	}
	effect := s.PendingEffects[0]
	preview := CloneState(s)
	discardPhaseSource(preview, gd, s.PendingEffects[0], &[]EngineEvent{})
	pawn := preview.Cybernet.PawnByID(s.PendingChoice.PawnID)
	for _, placed := range s.Cybernet.Blocks {
		block, ok := gd.BlockByID(placed.BlockID)
		if !ok || s.PendingEffects[0].ThreatMode == "" && threatening(s, placed.Coord) {
			continue
		}
		if s.PendingEffects[0].ThreatMode != "placement" && pawn != nil && MovementEntryError(gd, preview.Cybernet, pawn.PawnID, pawn.Coord, placed.Coord) != nil {
			continue
		}
		for _, space := range block.Spaces {
			if space.Effect != nil && effect.ThreatMode != "placement" && (effect.ThreatMode != "normal-movement" || SpaceStopError(preview, gd, s.PendingChoice.PawnID, SpaceRef{Coord: placed.Coord, SpaceID: space.ID}) != nil) {
				continue
			}
			if CanEndOn(gd, s.Cybernet, placed.Coord, space.ID, s.PendingChoice.PawnID) == nil {
				targets = append(targets, SpaceRef{Coord: placed.Coord, SpaceID: space.ID})
			}
		}
	}
	return targets
}

func discardChosen(s *domain.GameState, playerID string, cardIDs []string, amount int, events *[]EngineEvent) error {
	owner := s.PlayerByID(playerID)
	remaining := append([]string{}, owner.Hand...)
	if len(cardIDs) != amount {
		return fmt.Errorf("choose exactly %d physical hand card(s) to discard", amount)
	}
	for _, id := range cardIDs {
		found := -1
		for i, c := range remaining {
			if c == id {
				found = i
				break
			}
		}
		if found < 0 {
			return fmt.Errorf("a selected physical hand card is unavailable")
		}
		remaining = append(remaining[:found], remaining[found+1:]...)
	}
	owner.Hand = remaining
	s.Discard = append(s.Discard, cardIDs...)
	for _, id := range cardIDs {
		*events = append(*events, EngineEvent{Type: "card-discarded", CardID: id})
	}
	return nil
}

func ResolvePhaseChoice(s *domain.GameState, gd *domain.GameData, choiceID, optionID string, cardIDs []string, coord *domain.Coord, spaceID string, sinks ...*[]EngineEvent) error {
	events := phaseEventSink(sinks)
	normalStop := false
	choice := s.PendingChoice
	if choice == nil || choice.ID != choiceID || len(s.PendingEffects) == 0 || s.PendingEffects[0].ID != choice.EffectID {
		return fmt.Errorf("unknown or stale phase choice")
	}
	effect := s.PendingEffects[0]
	switch choice.Kind {
	case "discard-or-sacrifice":
		if coord != nil || spaceID != "" {
			return fmt.Errorf("discard or sacrifice cannot also relocate a pawn")
		}
		if optionID == "discard" {
			if err := discardChosen(s, choice.PlayerID, cardIDs, 1, events); err != nil {
				return err
			}
		} else if optionID == "sacrifice" {
			if len(cardIDs) > 0 {
				return fmt.Errorf("sacrifice cannot also discard hand cards")
			}
			if err := sacrificePhasePawn(s, gd, choice.PawnID, events); err != nil {
				return err
			}
		} else {
			return fmt.Errorf("choose discard or sacrifice")
		}
	case "discard-cards":
		if optionID != "discard" || coord != nil || spaceID != "" {
			return fmt.Errorf("choose the required hand cards to discard")
		}
		if err := discardChosen(s, choice.PlayerID, cardIDs, choice.Amount, events); err != nil {
			return err
		}
	case "relocate-pawn":
		if optionID != "relocate" || coord == nil || spaceID == "" || len(cardIDs) > 0 {
			return fmt.Errorf("choose one destination space for the relocation")
		}
		if effect.ThreatMode == "" && threatening(s, *coord) {
			return fmt.Errorf("relocation versus threats interpretation is unresolved")
		}
		if err := CanEndOn(gd, s.Cybernet, *coord, spaceID, choice.PawnID); err != nil {
			return err
		}
		pawn := s.Cybernet.PawnByID(choice.PawnID)
		if pawn == nil || pawn.OwnerID != choice.PlayerID {
			return fmt.Errorf("the relocating pawn is unavailable")
		}
		if effect.ThreatMode != "placement" {
			preview := CloneState(s)
			discardPhaseSource(preview, gd, effect, &[]EngineEvent{})
			if err := MovementEntryError(gd, preview.Cybernet, choice.PawnID, pawn.Coord, *coord); err != nil {
				if effect.ThreatMode == "" {
					return fmt.Errorf("relocation versus movement restrictions interpretation is unresolved")
				}
				return err
			}
		}
		if effect.ThreatMode != "placement" {
			if err := SpaceStopError(s, gd, pawn.PawnID, SpaceRef{Coord: *coord, SpaceID: spaceID}); err != nil {
				return err
			}
		}
		if effect.ThreatMode == "" {
			if placed := s.Cybernet.At(*coord); placed != nil {
				if b, ok := gd.BlockByID(placed.BlockID); ok {
					if sp := b.Space(spaceID); sp != nil && sp.Effect != nil {
						return fmt.Errorf("relocation versus effect-space stopping is unresolved")
					}
				}
			}
		}
		normalStop = effect.ThreatMode == "normal-movement" && (pawn.Coord != *coord || pawn.SpaceID != spaceID)
		discardPhaseSource(s, gd, effect, events)
		pawn.Coord = *coord
		pawn.SpaceID = spaceID
		copyCoord := *coord
		*events = append(*events, EngineEvent{Type: "pawn-relocated", PawnID: pawn.PawnID, Coord: &copyCoord, SpaceID: spaceID})
		if effect.ThreatMode == "normal-movement" {
			AwakenThreats(s, gd, pawn.PawnID, false)
		}
	default:
		return fmt.Errorf("unsupported pending phase choice")
	}
	s.PendingChoice = nil
	s.PendingEffects = s.PendingEffects[1:]
	if normalStop {
		if err := OfferSpaceEffect(s, gd, choice.PawnID); err != nil {
			return err
		}
	}
	return drainPhaseEffects(s, gd, events)
}

func applyPendingChoice(s *domain.GameState, gd *domain.GameData, a Action) TransitionResult {
	choice := s.PendingChoice
	if s.PendingBlockSacrifices != nil {
		choice = BlockSacrificeChoice(s, a.ChoiceID)
	}
	if s.PendingBlockDiscards != nil {
		choice = BlockDiscardChoice(s, a.ChoiceID)
	}
	playerID := a.PlayerID
	if playerID == "" {
		playerID = s.CurrentPlayerPtr().ID
	}
	if s.WinnerID != "" || a.Type != ActResolveChoice || choice == nil || playerID != choice.PlayerID {
		return TransitionResult{Phase: s.Phase, Error: "only the pending choice's player may resolve it", Events: []EngineEvent{{Type: "validation-failed", PlayerID: playerID, Message: "resolve the pending decision first"}}}
	}
	backup := CloneState(s)
	before, from := watchState(s), s.Phase
	effects := []EngineEvent{}
	var err error
	if choice.Kind == "block-detach" {
		err = ResolveBlockDetach(s, gd, a, &effects)
		if err == nil {
			err = ResumePhaseEffects(s, gd, &effects)
		}
	} else if choice.Kind == "block-attack" {
		err = ResolveBlockAttack(s, gd, a, &effects)
		if err == nil {
			err = ResumePhaseEffects(s, gd, &effects)
		}
	} else if choice.Kind == "steal-card" {
		err = ResolvePawnTheft(s, gd, a, &effects)
		if err == nil {
			err = ResumePhaseEffects(s, gd, &effects)
		}
	} else if choice.Kind == "space-discard" {
		err = ResolveSpaceEffect(s, gd, a, &effects)
		if err == nil {
			err = ResumePhaseEffects(s, gd, &effects)
		}
	} else if choice.Kind == "block-sacrifice" {
		err = ResolveBlockSacrifice(s, gd, a, &effects)
	} else if choice.Kind == "block-discard" {
		err = ResolveBlockDiscard(s, gd, a, &effects)
	} else if choice.Kind == "move-path" {
		err = ResolveMovementChoice(s, gd, a, &effects)
	} else if choice.Kind == "place-block" {
		err = ResolveSearchPlacement(s, gd, a, &effects)
	} else if choice.Kind == "prevent-elimination" {
		err = ResolveEliminationChoice(s, gd, a, &effects)
		if err == nil {
			err = ResumePhaseEffects(s, gd, &effects)
		}
	} else {
		err = ResolvePhaseChoice(s, gd, a.ChoiceID, a.OptionID, a.CardIDs, a.Coord, a.SpaceID, &effects)
	}
	if err != nil {
		*s = *backup
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: "validation-failed", PlayerID: playerID, Message: err.Error()}}}
	}
	events := []EngineEvent{{Type: EventChoiceResolved, PlayerID: playerID, CardID: choice.CardID, ElementID: choice.ID}}
	events = append(events, effects...)
	events = appendUnreportedDeltas(events, deltaEvents(s, before))
	if s.Phase != from {
		events = append(events, EngineEvent{Type: EventPhaseAdvanced, PlayerID: s.CurrentPlayerPtr().ID, FromPhase: from, ToPhase: s.Phase})
	}
	if s.PendingChoice != nil {
		events = append(events, EngineEvent{Type: EventChoiceRequired, PlayerID: s.PendingChoice.PlayerID, ElementID: s.PendingChoice.ID})
	}
	return TransitionResult{Accepted: true, Phase: s.Phase, Events: events}
}
