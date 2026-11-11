package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateSpaceArrows(block *domain.Block) error {
	seen := map[string]bool{}
	for _, a := range block.SpaceArrows {
		from, to := block.Space(a.From), block.Space(a.To)
		pair := []string{a.From, a.To}
		slices.Sort(pair)
		key := pair[0] + "/" + pair[1]
		if from == nil || to == nil || from.ID == to.ID || !slices.Contains(from.Neighbors, to.ID) || !slices.Contains(to.Neighbors, from.ID) || seen[key] {
			return fmt.Errorf("space arrows require distinct adjacent spaces and one direction per link")
		}
		seen[key] = true
	}
	return nil
}

func arrowAllowsStep(block *domain.Block, from, to string) bool {
	for _, a := range block.SpaceArrows {
		if a.From == to && a.To == from {
			return false
		}
	}
	return true
}
