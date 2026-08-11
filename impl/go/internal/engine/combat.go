package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Combat: attack rolls, the Delete ability, and pawn elimination. Mirrors
// impl/ts/src/engine/combat.ts. See DOCS/rules/speedrunners.md ("Attacking a
// pawn", "Delete ability", "Eliminating a pawn"). Backlog: T-104.
//
// SCOPE: single-target Delete. A pawn's Delete rolls one d6 per skull; if any die
// matches an UNSHIELDED defense die of the target, the target is eliminated. A
// match on a shielded die is blocked. Splitting an attack's dice across multiple
// targets, area attacks, and threat/Mark combat are later tasks.

// abilityUsedKey namespaces a pawn's once-per-turn ability marker.
func abilityUsedKey(ability, pawnID string) string {
	return ability + ":" + pawnID
}

// findAbility returns the named ability on a pawn definition, or nil.
func findAbility(pawn *domain.Pawn, name string) *domain.Ability {
	for i := range pawn.Abilities {
		if pawn.Abilities[i].Ability == name {
			return &pawn.Abilities[i]
		}
	}
	return nil
}

// AttackRoll rolls one d6 per skull via the seeded RNG (deterministic,
// parity-matched). skulls is clamped to at least 1.
func AttackRoll(rng *domain.RNG, skulls int) []int {
	if skulls < 1 {
		skulls = 1
	}
	out := make([]int, skulls)
	for i := range out {
		out[i] = rng.Intn(6) + 1
	}
	return out
}

// Defeats reports whether an attack roll eliminates a pawn with the given defense
// dice: any attack die value that equals an UNSHIELDED defense die value is a hit.
func Defeats(roll []int, defense []domain.DefenseDie) bool {
	for _, r := range roll {
		for _, d := range defense {
			if !d.Shielded && d.Value == r {
				return true
			}
		}
	}
	return false
}

// DeleteResult reports the outcome of a Delete attempt.
type DeleteResult struct {
	TargetPawnID string `json:"targetPawnId"`
	Roll         []int  `json:"roll"`
	Eliminated   bool   `json:"eliminated"`
}

// Delete resolves the attacker's Delete ability against a co-located target pawn.
// extraSkulls folds in cumulative skull modifiers (from cards/spaces — not yet
// auto-sourced). On elimination the target is removed from the board and added to
// the Eliminated pool.
func Delete(s *domain.GameState, gd *domain.GameData, attackerID, targetID string, extraSkulls int) (DeleteResult, error) {
	var res DeleteResult
	res.TargetPawnID = targetID

	if attackerID == targetID {
		return res, fmt.Errorf("a pawn cannot Delete itself")
	}
	atkPob := s.Cybernet.PawnByID(attackerID)
	if atkPob == nil {
		return res, fmt.Errorf("attacker %q is not on the board", attackerID)
	}
	tgtPob := s.Cybernet.PawnByID(targetID)
	if tgtPob == nil {
		return res, fmt.Errorf("target %q is not on the board", targetID)
	}
	if atkPob.Coord != tgtPob.Coord {
		return res, fmt.Errorf("attacker and target are not in the same block")
	}

	atk, ok := gd.PawnByID(attackerID)
	if !ok {
		return res, fmt.Errorf("unknown attacker pawn %q", attackerID)
	}
	tgt, ok := gd.PawnByID(targetID)
	if !ok {
		return res, fmt.Errorf("unknown target pawn %q", targetID)
	}

	ability := findAbility(atk, "delete")
	if ability == nil || ability.Activation == "none" {
		return res, fmt.Errorf("pawn %q cannot activate Delete", attackerID)
	}

	owner := s.PlayerByID(atkPob.OwnerID)
	if owner == nil {
		return res, fmt.Errorf("attacker %q has no controlling player", attackerID)
	}
	key := abilityUsedKey("delete", attackerID)
	if ability.Activation == "once-per-turn" && owner.OncePerTurnUsed[key] {
		return res, fmt.Errorf("pawn %q already used its once-per-turn Delete this turn", attackerID)
	}

	skulls := ability.Skulls
	if skulls < 1 {
		skulls = 1
	}
	skulls += extraSkulls

	res.Roll = AttackRoll(s.RNG, skulls)
	if Defeats(res.Roll, tgt.Defense) {
		eliminatePawn(s, targetID)
		res.Eliminated = true
	}
	if ability.Activation == "once-per-turn" {
		owner.OncePerTurnUsed[key] = true
	}
	return res, nil
}

// eliminatePawn removes a pawn from the board and records it in the Eliminated
// pool (for a later Reboot). Attached-card discard and control-card handling are
// later tasks.
func eliminatePawn(s *domain.GameState, pawnID string) {
	if s.Cybernet.RemovePawn(pawnID) {
		s.Eliminated = append(s.Eliminated, pawnID)
	}
}
