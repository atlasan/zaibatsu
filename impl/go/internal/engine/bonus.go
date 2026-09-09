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

// DetectBonusIconsAfterPlacement stores any newly formed bonus icons created by
// the latest placed block. Each icon is created at most once.
func DetectBonusIconsAfterPlacement(s *domain.GameState, gd *domain.GameData, placed *domain.PlacedBlock) []*domain.BonusIcon {
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
		incident := []*domain.PlacedBlock{}
		complete := true
		for _, coord := range candidate.coords {
			pb := s.Cybernet.At(coord)
			if pb == nil {
				complete = false
				break
			}
			incident = append(incident, pb)
		}
		if !complete {
			continue
		}
		if !blockHasFragmentAtKey(gd, incident[0], candidate.key) || !blockHasFragmentAtKey(gd, incident[1], candidate.key) || !blockHasFragmentAtKey(gd, incident[2], candidate.key) {
			continue
		}
		icon := &domain.BonusIcon{Key: candidate.key, Coords: candidate.coords}
		s.Cybernet.BonusIcons = append(s.Cybernet.BonusIcons, icon)
		created = append(created, icon)
	}
	return created
}

// CollectControlledBonusIcons pays any uncollected icons now controlled by the player.
func CollectControlledBonusIcons(s *domain.GameState, playerID string) []*domain.BonusIcon {
	player := s.PlayerByID(playerID)
	if player == nil {
		return nil
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
		if !eligible {
			continue
		}
		icon.CollectedBy = playerID
		player.BonusCounters++
		collected = append(collected, icon)
	}
	return collected
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
