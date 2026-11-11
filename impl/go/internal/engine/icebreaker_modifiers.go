package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"slices"
)

func ValidateIcebreakerAttachment(attach *domain.Attach) error {
	if attach == nil || attach.IcebreakerModifier == nil {
		return nil
	}
	m := attach.IcebreakerModifier
	seen := map[int]bool{}
	if (attach.As != "pawn" && attach.As != "enemy") || m.RollDice < 0 {
		return fmt.Errorf("unsupported or malformed acting Icebreaker attachment modifier")
	}
	for _, f := range m.Faces {
		if f < 1 || f > 6 || seen[f] {
			return fmt.Errorf("unsupported or malformed acting Icebreaker attachment modifier")
		}
		seen[f] = true
	}
	return nil
}

// EffectiveIcebreakerModifier combines only the acting pawn and its equipped grants.
func EffectiveIcebreakerModifier(gd *domain.GameData, pawn *domain.PawnOnBoard) domain.IcebreakerModifier {
	parts := []*domain.IcebreakerModifier{}
	if p, ok := gd.PawnByID(pawn.PawnID); ok {
		parts = append(parts, p.IcebreakerModifier)
	}
	for _, a := range pawn.Attachments {
		if c := cardByID(gd, a.CardID); c != nil && c.Attach != nil {
			parts = append(parts, c.Attach.IcebreakerModifier)
		}
	}
	out := domain.IcebreakerModifier{}
	for _, m := range parts {
		if m == nil {
			continue
		}
		for _, f := range m.Faces {
			if !slices.Contains(out.Faces, f) {
				out.Faces = append(out.Faces, f)
			}
		}
		out.RollDice += m.RollDice
		out.Black = out.Black || m.Black
		out.IgnoresBlackIce = out.IgnoresBlackIce || m.IgnoresBlackIce
	}
	slices.Sort(out.Faces)
	return out
}
