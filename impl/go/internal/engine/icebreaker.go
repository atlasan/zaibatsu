package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Icebreaker: gain control of a block or pawn that has an ICE value. Mirrors
// impl/ts/src/engine/icebreaker.ts. See DOCS/rules/speedrunners.md ("Icebreaker
// ability", "Black ICE"). Backlog: T-104.
//
// Roll a d6 (plus any roll-modifier dice); if any die matches one of the target's
// ICE faces, gain control. Controlling a block places one of your control markers
// on it (the real path to the win condition); controlling a pawn takes its
// control card (changes owner). Failing against Black ICE eliminates the
// attacking pawn.
//
// ICE FACES ARE PROVISIONAL. The data models ICE as a category (low/medium/high/
// black), not specific die faces. IceFaces derives canonical top-N faces so the
// base success probability is faithful to the rulebook (low = 3 chances, medium =
// 2, high = 1, black = 1 high-risk). Real face values (and thus exact ICE-value
// modifier interactions) come with transcription — tracked in tasks/BACKLOG.md.

// IceFaces returns the d6 faces that count as a successful Icebreak against the
// given ICE value. Empty for "none" (uncontrollable).
func IceFaces(ice domain.IceValue) []int {
	switch ice {
	case domain.IceLow:
		return []int{4, 5, 6}
	case domain.IceMedium:
		return []int{5, 6}
	case domain.IceHigh:
		return []int{6}
	case domain.IceBlack:
		return []int{6}
	default:
		return nil
	}
}

// IcebreakResult reports the outcome of an Icebreak attempt.
type IcebreakResult struct {
	Roll               []int `json:"roll"`
	Success            bool  `json:"success"`
	AttackerEliminated bool  `json:"attackerEliminated"`
}

// icebreakRoll rolls 1 + extraRollDice six-sided dice via the seeded RNG.
func icebreakRoll(rng *domain.RNG, extraRollDice int) []int {
	n := 1 + extraRollDice
	if n < 1 {
		n = 1
	}
	out := make([]int, n)
	for i := range out {
		out[i] = rng.Intn(6) + 1
	}
	return out
}

func anyMatch(roll, faces []int) bool {
	for _, r := range roll {
		for _, f := range faces {
			if r == f {
				return true
			}
		}
	}
	return false
}

// checkIcebreaker validates that the attacker may activate Icebreaker now and
// returns the owner, pawn definition, and board position.
func checkIcebreaker(s *domain.GameState, gd *domain.GameData, attackerID string) (*domain.Player, *domain.PawnOnBoard, error) {
	atkPob := s.Cybernet.PawnByID(attackerID)
	if atkPob == nil {
		return nil, nil, fmt.Errorf("attacker %q is not on the board", attackerID)
	}
	atk, ok := gd.PawnByID(attackerID)
	if !ok {
		return nil, nil, fmt.Errorf("unknown attacker pawn %q", attackerID)
	}
	ability := findAbility(atk, "icebreaker")
	if ability == nil || ability.Activation == "none" {
		return nil, nil, fmt.Errorf("pawn %q cannot activate Icebreaker", attackerID)
	}
	owner := s.PlayerByID(atkPob.OwnerID)
	if owner == nil {
		return nil, nil, fmt.Errorf("attacker %q has no controlling player", attackerID)
	}
	if ability.Activation == "once-per-turn" && owner.OncePerTurnUsed[abilityUsedKey("icebreaker", attackerID)] {
		return nil, nil, fmt.Errorf("pawn %q already used its once-per-turn Icebreaker this turn", attackerID)
	}
	return owner, atkPob, nil
}

// markIcebreakerUsed records the once-per-turn marker if applicable.
func markIcebreakerUsed(gd *domain.GameData, owner *domain.Player, attackerID string) {
	if atk, ok := gd.PawnByID(attackerID); ok {
		if ab := findAbility(atk, "icebreaker"); ab != nil && ab.Activation == "once-per-turn" {
			owner.OncePerTurnUsed[abilityUsedKey("icebreaker", attackerID)] = true
		}
	}
}

// resolveBlackIceFailure eliminates the attacker if the target had Black ICE and
// the attempt failed. Returns whether the attacker was eliminated.
func resolveBlackIceFailure(s *domain.GameState, ice domain.IceValue, attackerID string, success bool) bool {
	if !success && ice == domain.IceBlack {
		eliminatePawn(s, attackerID)
		return true
	}
	return false
}

// IcebreakBlock attempts to gain control of the block the attacker occupies.
func IcebreakBlock(s *domain.GameState, gd *domain.GameData, attackerID string, coord domain.Coord, extraRollDice int) (IcebreakResult, error) {
	var res IcebreakResult
	owner, atkPob, err := checkIcebreaker(s, gd, attackerID)
	if err != nil {
		return res, err
	}
	if atkPob.Coord != coord {
		return res, fmt.Errorf("attacker %q is not on the target block", attackerID)
	}
	pb := s.Cybernet.At(coord)
	if pb == nil {
		return res, fmt.Errorf("no block at %v", coord)
	}
	blockDef, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return res, fmt.Errorf("unknown block %q", pb.BlockID)
	}
	faces := IceFaces(blockDef.IceValue)
	if len(faces) == 0 {
		return res, fmt.Errorf("block %q has no ICE value and cannot be controlled", pb.BlockID)
	}
	if pb.OwnerID == owner.ID {
		return res, fmt.Errorf("you already control block %q", pb.BlockID)
	}

	res.Roll = icebreakRoll(s.RNG, extraRollDice)
	res.Success = anyMatch(res.Roll, faces)

	if res.Success {
		if owner.MarkersRemaining() <= 0 {
			return res, fmt.Errorf("player %s has no control markers to place", owner.ID)
		}
		// Steal: return the previous controller's marker.
		if pb.OwnerID != "" {
			if prev := s.PlayerByID(pb.OwnerID); prev != nil && prev.ControlMarkersPlaced > 0 {
				prev.ControlMarkersPlaced--
			}
		}
		pb.OwnerID = owner.ID
		owner.ControlMarkersPlaced++
		checkWin(s)
	} else {
		res.AttackerEliminated = resolveBlackIceFailure(s, blockDef.IceValue, attackerID, res.Success)
	}

	markIcebreakerUsed(gd, owner, attackerID)
	return res, nil
}

// IcebreakPawn attempts to gain control of a co-located pawn that has an ICE value.
func IcebreakPawn(s *domain.GameState, gd *domain.GameData, attackerID, targetID string, extraRollDice int) (IcebreakResult, error) {
	var res IcebreakResult
	if attackerID == targetID {
		return res, fmt.Errorf("a pawn cannot Icebreak itself")
	}
	owner, atkPob, err := checkIcebreaker(s, gd, attackerID)
	if err != nil {
		return res, err
	}
	tgtPob := s.Cybernet.PawnByID(targetID)
	if tgtPob == nil {
		return res, fmt.Errorf("target %q is not on the board", targetID)
	}
	if atkPob.Coord != tgtPob.Coord {
		return res, fmt.Errorf("attacker and target are not in the same block")
	}
	if tgtPob.OwnerID == owner.ID {
		return res, fmt.Errorf("you already control pawn %q", targetID)
	}
	tgt, ok := gd.PawnByID(targetID)
	if !ok {
		return res, fmt.Errorf("unknown target pawn %q", targetID)
	}
	faces := IceFaces(tgt.IceValue)
	if len(faces) == 0 {
		return res, fmt.Errorf("pawn %q has no ICE value and cannot be controlled", targetID)
	}

	res.Roll = icebreakRoll(s.RNG, extraRollDice)
	res.Success = anyMatch(res.Roll, faces)

	if res.Success {
		tgtPob.OwnerID = owner.ID
	} else {
		res.AttackerEliminated = resolveBlackIceFailure(s, tgt.IceValue, attackerID, res.Success)
	}

	markIcebreakerUsed(gd, owner, attackerID)
	return res, nil
}
