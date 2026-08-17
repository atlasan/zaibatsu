package domain

// Pawn positions and space occupancy on the Cybernet. Mirrors
// impl/ts/src/domain/pawn_board.ts. See DOCS/domain-model.md and
// DOCS/rules/speedrunners/board-and-movement.md ("SR-BOARD-001", "SR-MOVE-002").

// Attachment is an action card attached to a pawn or block, occupying a slot and
// optionally holding bonus counters paid to attach it. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
// ("Attaching cards").
type Attachment struct {
	CardID    string `json:"cardId"`
	Slot      string `json:"slot,omitempty"`
	BonusPaid int    `json:"bonusPaid,omitempty"`
}

// PawnOnBoard is a pawn instance positioned in the Cybernet.
type PawnOnBoard struct {
	PawnID      string       `json:"pawnId"`
	OwnerID     string       `json:"ownerId"` // player id, or "" if free of player control
	Coord       Coord        `json:"coord"`
	SpaceID     string       `json:"spaceId"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

// HasSlotFilled reports whether an attachment already occupies the given slot.
func (p *PawnOnBoard) HasSlotFilled(slot string) bool {
	for _, a := range p.Attachments {
		if a.Slot == slot {
			return true
		}
	}
	return false
}

// Unlimited is the capacity of special / pawn spaces (no pawn limit).
const Unlimited = -1

// SpaceCapacity returns how many pawns a space of the given type may hold.
// -1 (Unlimited) means no limit.
func SpaceCapacity(spaceType string) int {
	switch spaceType {
	case "normal", "effect":
		return 1
	case "double":
		return 2 // legacy data only
	case "special", "pawn":
		return Unlimited
	default:
		return 1
	}
}

// SpaceCapacityFor prefers source-reviewed explicit capacity and falls back to
// the legacy type mapping so older saved games remain readable.
func SpaceCapacityFor(space *Space) int {
	if space != nil && space.Capacity != 0 {
		return int(space.Capacity)
	}
	if space == nil {
		return 0
	}
	return SpaceCapacity(space.Type)
}

// Space returns the space definition with the given id on this block, or nil.
func (b *Block) Space(id string) *Space {
	for i := range b.Spaces {
		if b.Spaces[i].ID == id {
			return &b.Spaces[i]
		}
	}
	return nil
}

// PawnByID returns the board pawn with the given id, or nil.
func (cy *Cybernet) PawnByID(pawnID string) *PawnOnBoard {
	for _, p := range cy.Pawns {
		if p.PawnID == pawnID {
			return p
		}
	}
	return nil
}

// PawnsAt returns all board pawns on the block at coord c.
func (cy *Cybernet) PawnsAt(c Coord) []*PawnOnBoard {
	var out []*PawnOnBoard
	for _, p := range cy.Pawns {
		if p.Coord == c {
			out = append(out, p)
		}
	}
	return out
}

// SpaceOccupants returns the board pawns currently on a specific space.
func (cy *Cybernet) SpaceOccupants(c Coord, spaceID string) []*PawnOnBoard {
	var out []*PawnOnBoard
	for _, p := range cy.Pawns {
		if p.Coord == c && p.SpaceID == spaceID {
			out = append(out, p)
		}
	}
	return out
}

// PlacePawn adds a pawn to the board (no validation — callers validate first).
func (cy *Cybernet) PlacePawn(p *PawnOnBoard) {
	cy.Pawns = append(cy.Pawns, p)
}

// RemovePawn removes the board pawn with the given id, reporting whether it was
// present.
func (cy *Cybernet) RemovePawn(pawnID string) bool {
	for i, p := range cy.Pawns {
		if p.PawnID == pawnID {
			cy.Pawns = append(cy.Pawns[:i], cy.Pawns[i+1:]...)
			return true
		}
	}
	return false
}
