package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type ControlMarkerAllocation struct {
	PlayerID  string `json:"playerId"`
	Kind      string `json:"kind"`
	ElementID string `json:"elementId"`
	Amount    int    `json:"amount"`
}

// ControlMarkerAllocations returns detached public physical locations, including ordinary block markers.
func ControlMarkerAllocations(s *domain.GameState) []ControlMarkerAllocation {
	out := []ControlMarkerAllocation{}
	for _, b := range s.Cybernet.Blocks {
		if b.OwnerID != "" {
			out = append(out, ControlMarkerAllocation{b.OwnerID, "block", fmt.Sprintf("%d,%d", b.Coord.Q, b.Coord.R), 1})
		}
	}
	for _, m := range s.ControlCardMarkers {
		out = append(out, ControlMarkerAllocation{m.PlayerID, "control-card", m.CardID, m.Amount})
	}
	return out
}

// GainPawnControl represents actual acquisition; Reboot and zone synchronization use SetPawnControl.
func GainPawnControl(s *domain.GameState, gd *domain.GameData, pawnID, ownerID string, sinks ...*[]EngineEvent) error {
	var events *[]EngineEvent
	if len(sinks) > 0 {
		events = sinks[0]
	}
	previous := ""
	if p := s.Cybernet.PawnByID(pawnID); p != nil {
		previous = p.OwnerID
	}
	changed := func() {
		if events != nil && previous != ownerID {
			*events = append(*events, EngineEvent{Type: EventControlChanged, Element: "pawn", ElementID: pawnID, FromOwnerID: previous, ToOwnerID: ownerID})
		}
	}
	if s.RulesVersion == "" {
		SetPawnControl(s, pawnID, ownerID)
		changed()
		return nil
	}
	owner := s.PlayerByID(ownerID)
	if owner == nil {
		return fmt.Errorf("pawn control requires a registered player")
	}
	var effect *domain.ControlMarkerEffect
	if def, ok := gd.PawnByID(pawnID); ok {
		effect = def.ControlMarkerEffect
	}
	cards := []domain.ControlCardState{}
	for _, c := range s.ControlCards {
		if c.Subject.Kind == "pawn" && c.Subject.ID == pawnID {
			cards = append(cards, c)
		}
	}
	marked := []domain.ControlCardMarker{}
	for _, m := range s.ControlCardMarkers {
		for _, c := range cards {
			if c.CardID == m.CardID {
				marked = append(marked, m)
			}
		}
	}
	if effect != nil && (effect.Kind != "place-on-control-card" || effect.Amount != 1) {
		return fmt.Errorf("unsupported control-marker effect")
	}
	if len(marked) > 1 {
		return fmt.Errorf("duplicate control-card marker allocation")
	}
	if effect != nil && len(cards) != 1 {
		return fmt.Errorf("control-marker effect requires one physical control card")
	}
	if effect != nil && cards[0].OwnerID == ownerID {
		return nil
	}
	for _, m := range marked {
		if m.PlayerID == ownerID {
			return fmt.Errorf("reacquiring a common card with your own marker needs a source ruling")
		}
		p := s.PlayerByID(m.PlayerID)
		if m.Amount != 1 || p == nil || p.ControlMarkersPlaced < 1 {
			return fmt.Errorf("invalid control-card marker allocation")
		}
	}
	if effect != nil && owner.ControlMarkersPlaced >= owner.ControlMarkersTotal {
		return fmt.Errorf("no control marker remains for the control card")
	}
	for _, m := range marked {
		s.PlayerByID(m.PlayerID).ControlMarkersPlaced -= m.Amount
		if events != nil {
			*events = append(*events, EngineEvent{Type: "control-marker-returned", PlayerID: m.PlayerID, CardID: m.CardID, Element: "control-card", ElementID: m.CardID})
		}
	}
	if len(marked) > 0 {
		kept := []domain.ControlCardMarker{}
		for _, m := range s.ControlCardMarkers {
			remove := false
			for _, old := range marked {
				if m == old {
					remove = true
				}
			}
			if !remove {
				kept = append(kept, m)
			}
		}
		s.ControlCardMarkers = kept
	}
	SetPawnControl(s, pawnID, ownerID)
	changed()
	if effect != nil {
		s.ControlCardMarkers = append(s.ControlCardMarkers, domain.ControlCardMarker{PlayerID: ownerID, CardID: cards[0].CardID, Amount: 1})
		owner.ControlMarkersPlaced++
		if events != nil {
			*events = append(*events, EngineEvent{Type: "control-marker-placed", PlayerID: ownerID, CardID: cards[0].CardID, Element: "control-card", ElementID: cards[0].CardID})
		}
		checkWin(s)
	}
	return nil
}
