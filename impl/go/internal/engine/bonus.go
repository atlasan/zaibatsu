package engine

import (
	"fmt"
	"sort"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

var cornerDirections = [][2]int{
	{1, 2},
	{0, 1},
	{5, 0},
	{4, 5},
	{3, 4},
	{2, 3},
}

func compareCoord(a, b domain.Coord) int {
	if a.Q == b.Q {
		return a.R - b.R
	}
	return a.Q - b.Q
}

func sortedCoords(coords []domain.Coord) []domain.Coord {
	out := append([]domain.Coord{}, coords...)
	sort.Slice(out, func(i, j int) bool { return compareCoord(out[i], out[j]) < 0 })
	return out
}

func keyForCoords(coords []domain.Coord) string {
	sorted := sortedCoords(coords)
	parts := make([]string, 0, len(sorted))
	for _, coord := range sorted {
		parts = append(parts, fmt.Sprintf("%d,%d", coord.Q, coord.R))
	}
	return stringsJoin(parts, "|")
}

func bonusCornersFor(block *domain.Block) []bool {
	if len(block.BonusCorners) == 6 {
		return block.BonusCorners
	}
	return []bool{false, false, false, false, false, false}
}

func vertexCoordsForCorner(coord domain.Coord, rotation, cornerIndex int) []domain.Coord {
	dirs := cornerDirections[cornerIndex]
	return sortedCoords([]domain.Coord{
		coord,
		coord.Neighbor((dirs[0] + rotation) % 6),
		coord.Neighbor((dirs[1] + rotation) % 6),
	})
}

type bonusVertex struct {
	key    string
	coords []domain.Coord
}

func blockVertexKeys(block *domain.Block, placed *domain.PlacedBlock) []bonusVertex {
	out := []bonusVertex{}
	for cornerIndex, hasFragment := range bonusCornersFor(block) {
		if !hasFragment {
			continue
		}
		coords := vertexCoordsForCorner(placed.Coord, placed.Rotation, cornerIndex)
		out = append(out, bonusVertex{key: keyForCoords(coords), coords: coords})
	}
	return out
}

func blockHasFragmentAtKey(gd *domain.GameData, placed *domain.PlacedBlock, key string) bool {
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return false
	}
	for _, entry := range blockVertexKeys(block, placed) {
		if entry.key == key {
			return true
		}
	}
	return false
}

// Candidates require the proposed block in the supplied virtual or live board.
func bonusCandidates(s *domain.GameState, gd *domain.GameData, placed *domain.PlacedBlock) []*domain.BonusIcon {
	block, ok := gd.BlockByID(placed.BlockID)
	if !ok {
		return nil
	}
	created := []*domain.BonusIcon{}
	for _, candidate := range blockVertexKeys(block, placed) {
		exists := false
		for _, icon := range s.Cybernet.BonusIcons {
			if icon.Key == candidate.key {
				exists = true
				break
			}
		}
		if exists {
			continue
		}
		complete := true
		for _, coord := range candidate.coords {
			pb := s.Cybernet.At(coord)
			if pb == nil || !blockHasFragmentAtKey(gd, pb, candidate.key) {
				complete = false
				break
			}
		}
		if complete {
			created = append(created, &domain.BonusIcon{Key: candidate.key, Coords: candidate.coords})
		}
	}
	return created
}
func BonusPlacementError(s *domain.GameState, gd *domain.GameData, placed *domain.PlacedBlock) error {
	cy := *s.Cybernet
	cy.Blocks = append(append([]*domain.PlacedBlock{}, s.Cybernet.Blocks...), placed)
	virtual := *s
	virtual.Cybernet = &cy
	award := 0
	if block, ok := gd.BlockByID(placed.BlockID); ok {
		if err := ValidateGlobalBonusEffect(block, false); err != nil {
			return err
		}
		if err := ValidateBlockBonus(block, false); err != nil {
			return err
		}
		e := block.Effects.InCybernet
		if e != nil && e.Kind == "place-block-bonus" {
			award = 1
		}
		if e != nil && e.Kind == "gain-bonus-all-players" {
			award = len(s.Players) * e.Amount
		}
	}
	return RequireBonusReserve(s, len(bonusCandidates(&virtual, gd, placed))+award)
}

// All icon allocation succeeds or no icon is added. Placement effects run afterward.
func DetectBonusIconsAfterPlacement(s *domain.GameState, gd *domain.GameData, placed *domain.PlacedBlock) ([]*domain.BonusIcon, error) {
	created := bonusCandidates(s, gd, placed)
	if err := RequireBonusReserve(s, len(created)); err != nil {
		return nil, err
	}
	if s.BonusCounterSupply != nil {
		for _, icon := range created {
			icon.CounterPlaced = true
		}
	}
	s.Cybernet.BonusIcons = append(s.Cybernet.BonusIcons, created...)
	return created, nil
}

// Collection transfers existing board counters rather than allocating new ones.
func CollectControlledBonusIcons(s *domain.GameState, playerID string) ([]*domain.BonusIcon, error) {
	player := s.PlayerByID(playerID)
	if player == nil {
		return nil, nil
	}
	collected := []*domain.BonusIcon{}
	for _, icon := range s.Cybernet.BonusIcons {
		if icon.CollectedBy != "" {
			continue
		}
		eligible := true
		for _, coord := range icon.Coords {
			if pb := s.Cybernet.At(coord); pb == nil || pb.OwnerID != playerID {
				eligible = false
				break
			}
		}
		if eligible {
			if s.BonusCounterSupply != nil && !icon.CounterPlaced {
				return nil, fmt.Errorf("a source bonus icon needs exactly one uncollected physical counter")
			}
			collected = append(collected, icon)
		}
	}
	for _, icon := range collected {
		icon.CollectedBy = playerID
		icon.CounterPlaced = false
		player.BonusCounters++
	}
	return collected, nil
}

func stringsJoin(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for _, part := range parts[1:] {
		out += sep + part
	}
	return out
}
