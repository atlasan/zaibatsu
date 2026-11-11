package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateControlledPlacement(block *domain.Block, gd *domain.GameData) error {
	for _, entry := range []struct {
		name string
		e    *domain.BlockEffect
	}{{"inCybernet", block.Effects.InCybernet}, {"underControl", block.Effects.UnderControl}} {
		e := entry.e
		if e == nil || e.Kind != "place-controlled-pawn" {
			continue
		}
		_, known := gd.PawnByID(e.Target)
		spaces, cards := 0, 0
		for _, sp := range block.Spaces {
			if sp.Type == "pawn" && sp.PawnID == e.Target {
				spaces++
			}
		}
		for _, c := range gd.ControlCards {
			if c.Subject.Kind == "pawn" && c.Subject.ID == e.Target {
				cards++
			}
		}
		if entry.name != "underControl" || !known || e.Amount != 0 || e.MinimumControlledPawns != 0 || spaces != 1 || cards != 1 {
			return fmt.Errorf("controlled placement requires under-control timing, a known pawn, one matching space and physical control card")
		}
	}
	return nil
}
func placeControlledPawn(s *domain.GameState, gd *domain.GameData, coord domain.Coord, pawnID string, events *[]EngineEvent) (*domain.PawnOnBoard, error) {
	placed := s.Cybernet.At(coord)
	if placed == nil {
		return nil, fmt.Errorf("controlled placement needs a controlled block")
	}
	block, ok := gd.BlockByID(placed.BlockID)
	owner := s.PlayerByID(placed.OwnerID)
	_, known := gd.PawnByID(pawnID)
	if s.RulesVersion == "" || !ok || owner == nil || !known {
		return nil, fmt.Errorf("controlled placement needs a controlled block and matching physical pawn/card")
	}
	spaceID := ""
	spaces, cards := 0, 0
	var card *domain.ControlCardState
	for _, sp := range block.Spaces {
		if sp.Type == "pawn" && sp.PawnID == pawnID {
			spaceID = sp.ID
			spaces++
		}
	}
	for i := range s.ControlCards {
		c := &s.ControlCards[i]
		if c.Subject.Kind == "pawn" && c.Subject.ID == pawnID {
			card = c
			cards++
		}
	}
	if spaces != 1 || cards != 1 {
		return nil, fmt.Errorf("controlled placement needs a matching physical pawn/card")
	}
	existing := s.Cybernet.PawnByID(pawnID)
	count := 0
	reserve, retained := false, false
	for _, p := range s.Cybernet.Pawns {
		if p.PawnID == pawnID {
			count++
		}
	}
	for _, id := range s.Reserve {
		if id == pawnID {
			count++
			reserve = true
		}
	}
	for _, id := range s.Eliminated {
		if id == pawnID {
			count++
			retained = true
		}
	}
	if slices.Contains(s.OutOfGame, pawnID) || count != 1 || reserve && (card.Zone != "common" || card.OwnerID != "") || existing != nil && (card.OwnerID != existing.OwnerID || existing.OwnerID != "" && card.Zone != "control" || existing.OwnerID == "" && card.Zone != "common") || retained && (card.Zone != "control" || s.PlayerByID(card.OwnerID) == nil) {
		return nil, fmt.Errorf("controlled placement physical pool/control-card mismatch")
	}
	if err := CanEndOn(gd, s.Cybernet, coord, spaceID, pawnID); err != nil {
		return nil, err
	}
	if existing != nil && existing.OwnerID != owner.ID {
		ids := []string{}
		for _, a := range existing.Attachments {
			ids = append(ids, a.CardID)
		}
		discardAttachments(s, existing)
		for _, id := range ids {
			*events = append(*events, EngineEvent{Type: "card-discarded", CardID: id})
		}
	}
	pawn := existing
	if pawn == nil {
		pawn = &domain.PawnOnBoard{PawnID: pawnID, OwnerID: card.OwnerID, Coord: coord, SpaceID: spaceID}
	}
	moved := existing != nil && (pawn.Coord != coord || pawn.SpaceID != spaceID)
	pawn.Coord = coord
	pawn.SpaceID = spaceID
	if existing == nil {
		s.Cybernet.PlacePawn(pawn)
		c := coord
		*events = append(*events, EngineEvent{Type: EventPawnPlaced, Element: "pawn", ElementID: pawnID, ToOwnerID: owner.ID, Coord: &c, SpaceID: spaceID})
	} else if moved {
		c := coord
		*events = append(*events, EngineEvent{Type: "pawn-relocated", PawnID: pawnID, Coord: &c, SpaceID: spaceID})
	}
	s.Reserve = slices.DeleteFunc(s.Reserve, func(id string) bool { return id == pawnID })
	s.Eliminated = slices.DeleteFunc(s.Eliminated, func(id string) bool { return id == pawnID })
	if err := GainPawnControl(s, gd, pawnID, owner.ID, events); err != nil {
		return nil, err
	}
	return pawn, nil
}
