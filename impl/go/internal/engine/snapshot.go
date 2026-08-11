package engine

import (
	"encoding/json"
	"sort"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Snapshot produces a canonical, compact JSON string of the meaningful game state
// for cross-mirror comparison and golden-game tests. It mirrors
// impl/ts/src/engine/snapshot.ts exactly: same field order, same normalization
// (no omitted fields, empty slices as [], map keys sorted), so the two mirrors
// emit byte-identical snapshots from the same seed + action sequence. The RNG's
// internal state is intentionally excluded. See DOCS/parity.md.

type snapAtt struct {
	CardID    string `json:"cardId"`
	Slot      string `json:"slot"`
	BonusPaid int    `json:"bonusPaid"`
}

type snapPlayer struct {
	ID            string   `json:"id"`
	Color         string   `json:"color"`
	PawnID        string   `json:"pawnId"`
	MarkersTotal  int      `json:"markersTotal"`
	MarkersPlaced int      `json:"markersPlaced"`
	Bonus         int      `json:"bonus"`
	Hand          []string `json:"hand"`
	OncePerTurn   []string `json:"oncePerTurn"`
}

type snapBlock struct {
	BlockID     string    `json:"blockId"`
	Rotation    int       `json:"rotation"`
	Q           int       `json:"q"`
	R           int       `json:"r"`
	OwnerID     string    `json:"ownerId"`
	Attachments []snapAtt `json:"attachments"`
}

type snapPawn struct {
	PawnID      string    `json:"pawnId"`
	OwnerID     string    `json:"ownerId"`
	Q           int       `json:"q"`
	R           int       `json:"r"`
	SpaceID     string    `json:"spaceId"`
	Attachments []snapAtt `json:"attachments"`
}

type snapshotDTO struct {
	Turn          int          `json:"turn"`
	Phase         string       `json:"phase"`
	CurrentPlayer int          `json:"currentPlayer"`
	WinnerID      string       `json:"winnerId"`
	Players       []snapPlayer `json:"players"`
	Deck          []string     `json:"deck"`
	Discard       []string     `json:"discard"`
	BlockPile     []string     `json:"blockPile"`
	Eliminated    []string     `json:"eliminated"`
	Blocks        []snapBlock  `json:"blocks"`
	Pawns         []snapPawn   `json:"pawns"`
}

func strSlice(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

func snapAtts(atts []domain.Attachment) []snapAtt {
	out := make([]snapAtt, 0, len(atts))
	for _, a := range atts {
		out = append(out, snapAtt{CardID: a.CardID, Slot: a.Slot, BonusPaid: a.BonusPaid})
	}
	return out
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k, v := range m {
		if v {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// Snapshot returns the canonical JSON snapshot of s.
func Snapshot(s *domain.GameState) string {
	dto := snapshotDTO{
		Turn:          s.Turn,
		Phase:         string(s.Phase),
		CurrentPlayer: s.CurrentPlayer,
		WinnerID:      s.WinnerID,
		Players:       make([]snapPlayer, 0, len(s.Players)),
		Deck:          strSlice(s.Deck),
		Discard:       strSlice(s.Discard),
		BlockPile:     strSlice(s.BlockPile),
		Eliminated:    strSlice(s.Eliminated),
		Blocks:        make([]snapBlock, 0),
		Pawns:         make([]snapPawn, 0),
	}
	for _, p := range s.Players {
		dto.Players = append(dto.Players, snapPlayer{
			ID:            p.ID,
			Color:         p.Color,
			PawnID:        p.PawnID,
			MarkersTotal:  p.ControlMarkersTotal,
			MarkersPlaced: p.ControlMarkersPlaced,
			Bonus:         p.BonusCounters,
			Hand:          strSlice(p.Hand),
			OncePerTurn:   sortedKeys(p.OncePerTurnUsed),
		})
	}
	if s.Cybernet != nil {
		for _, b := range s.Cybernet.Blocks {
			dto.Blocks = append(dto.Blocks, snapBlock{
				BlockID: b.BlockID, Rotation: b.Rotation, Q: b.Coord.Q, R: b.Coord.R,
				OwnerID: b.OwnerID, Attachments: snapAtts(b.Attachments),
			})
		}
		for _, pw := range s.Cybernet.Pawns {
			dto.Pawns = append(dto.Pawns, snapPawn{
				PawnID: pw.PawnID, OwnerID: pw.OwnerID, Q: pw.Coord.Q, R: pw.Coord.R,
				SpaceID: pw.SpaceID, Attachments: snapAtts(pw.Attachments),
			})
		}
	}
	b, err := json.Marshal(dto)
	if err != nil {
		return ""
	}
	return string(b)
}
