package domain

// Hex geometry for the Cybernet. Blocks are hexagonal tiles connected edge to
// edge. This mirrors impl/ts/src/domain/hex.ts exactly — same direction ordering,
// edge-facing convention, and rotation convention (the parity/determinism
// contract in DOCS/parity.md). See DOCS/domain-model.md ("Cybernet").
//
// Coordinates are axial (Q, R). The six edges of a hex are indexed 0..5 and each
// edge i faces grid direction i. HexDirections[i] is the coordinate delta to the
// neighbor across edge i. The neighbor's edge facing back is Opposite(i).

// Coord is an axial hex coordinate.
type Coord struct {
	Q int `json:"q"`
	R int `json:"r"`
}

// HexDirections maps each of the 6 edge/grid directions to a neighbor delta.
// The ordering is canonical and shared with the TS mirror; do not reorder.
var HexDirections = [6]Coord{
	{Q: 1, R: 0},
	{Q: 1, R: -1},
	{Q: 0, R: -1},
	{Q: -1, R: 0},
	{Q: -1, R: 1},
	{Q: 0, R: 1},
}

// Neighbor returns the coordinate across edge/direction dir (0..5).
func (c Coord) Neighbor(dir int) Coord {
	d := HexDirections[((dir%6)+6)%6]
	return Coord{Q: c.Q + d.Q, R: c.R + d.R}
}

// Opposite returns the edge that faces back across a shared border.
func Opposite(dir int) int {
	return ((dir%6)+6+3)%6
}

// PlacedBlock is a block instance positioned in the Cybernet with a rotation.
// A block's local edge e faces grid direction (e + Rotation) mod 6.
type PlacedBlock struct {
	BlockID  string `json:"blockId"`
	Rotation int    `json:"rotation"`
	Coord    Coord  `json:"coord"`
	// OwnerID is the player controlling this block (via Icebreaker), or "" if
	// uncontrolled. A controlled block carries one of that player's control markers.
	OwnerID string `json:"ownerId,omitempty"`
}

// Cybernet is the growing hex layout of placed blocks and the pawns on them.
// Both are stored in insertion order (deterministic iteration); lookups scan the
// small slices.
type Cybernet struct {
	Blocks []*PlacedBlock `json:"blocks"`
	Pawns  []*PawnOnBoard `json:"pawns"`
}

// NewCybernet returns an empty Cybernet.
func NewCybernet() *Cybernet {
	return &Cybernet{Blocks: []*PlacedBlock{}, Pawns: []*PawnOnBoard{}}
}

// At returns the placed block at coord c, or nil if the cell is empty.
func (cy *Cybernet) At(c Coord) *PlacedBlock {
	for _, pb := range cy.Blocks {
		if pb.Coord == c {
			return pb
		}
	}
	return nil
}

// Occupied reports whether cell c holds a block.
func (cy *Cybernet) Occupied(c Coord) bool {
	return cy.At(c) != nil
}

// place adds a block instance (no validation — callers validate first).
func (cy *Cybernet) place(pb *PlacedBlock) {
	cy.Blocks = append(cy.Blocks, pb)
}
