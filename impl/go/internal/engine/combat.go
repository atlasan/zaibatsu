package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Combat: attack rolls, the Delete ability, and pawn elimination. Mirrors
// impl/ts/src/engine/combat.ts. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md ("SR-ABILITY-002
// pawn", "Delete ability", "Eliminating a pawn"). Backlog: T-104.
//
// SCOPE: targeted Delete, Bomb-class area Delete, and multi-target die
// assignment. A pawn's Delete rolls one d6 per skull; if any die matches an
// UNSHIELDED defense die of the target, the target is eliminated. A match on a
// shielded die is blocked. Public threat combat and replacement windows live
// in their dedicated modules; complete component/mode coverage remains open.

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

func abilityListHas(list []string, name string) bool {
	for _, a := range list {
		if a == name {
			return true
		}
	}
	return false
}

// effectiveAbility is a compatibility summary. Source Delete returns its first
// supported route; action/query callers select explicit card/free routes through
// DeleteActivationOptions and requireDeleteActivation. Other abilities and
// explicit frozen data retain their historical grants/removes logic.
func effectiveAbility(gd *domain.GameData, pawn *domain.Pawn, atts []domain.Attachment, name string) *domain.Ability {
	if name == "delete" && gd.RegressionFixture != "provisional-v1" {
		options := DeleteActivationOptions(gd, pawn, atts)
		if len(options) > 0 {
			return &options[0]
		}
		return nil
	}
	for _, a := range atts {
		if card := cardByID(gd, a.CardID); card != nil && card.Attach != nil && abilityListHas(card.Attach.Removes, name) {
			return nil
		}
	}
	if ab := findAbility(pawn, name); ab != nil {
		return ab
	}
	for _, a := range atts {
		if card := cardByID(gd, a.CardID); card != nil && card.Attach != nil && abilityListHas(card.Attach.Grants, name) {
			return &domain.Ability{Ability: name, Activation: "card"}
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

func EffectiveAttackSkulls(gd *domain.GameData, s *domain.GameState, pawnID string, base int) int {
	p := s.Cybernet.PawnByID(pawnID)
	skulls := base
	if skulls < 1 {
		skulls = 1
	}
	if p == nil {
		return skulls
	}
	for _, att := range p.Attachments {
		c := cardByID(gd, att.CardID)
		if c != nil && c.Attach != nil {
			skulls += c.Attach.AttackModifier
		}
	}
	pb := s.Cybernet.At(p.Coord)
	if pb != nil {
		b, ok := gd.BlockByID(pb.BlockID)
		if ok {
			for _, sp := range b.Spaces {
				if sp.ID == p.SpaceID && sp.Modifier != nil && sp.Modifier.Kind == "attack" {
					skulls += sp.Modifier.Amount
				}
			}
		}
	}
	if skulls < 1 {
		skulls = 1
	}
	return skulls
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
func Delete(s *domain.GameState, gd *domain.GameData, attackerID, targetID string, extraSkulls int, activations ...string) (DeleteResult, error) {
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
	if _, ok := gd.PawnByID(targetID); !ok {
		return res, fmt.Errorf("unknown target pawn %q", targetID)
	}

	ability := effectiveAbility(gd, atk, atkPob.Attachments, "delete")
	if gd.RegressionFixture != "provisional-v1" {
		activation := "once-per-turn"
		if len(activations) > 0 {
			activation = activations[0]
		}
		var err error
		ability, err = requireDeleteActivation(gd, atk, atkPob.Attachments, activation)
		if err != nil {
			return res, err
		}
	}
	if ability == nil || ability.Activation == "none" {
		return res, fmt.Errorf("pawn %q cannot activate Delete", attackerID)
	}

	owner := s.PlayerByID(atkPob.OwnerID)
	if owner == nil {
		return res, fmt.Errorf("attacker %q has no controlling player", attackerID)
	}
	if ability.Activation == "once-per-turn" && AbilityUseSpent(s, gd, owner, attackerID, "delete") {
		return res, fmt.Errorf("pawn %q already used its once-per-turn Delete this turn", attackerID)
	}

	skulls := EffectiveAttackSkulls(gd, s, attackerID, ability.Skulls)
	skulls += extraSkulls

	if s.RulesVersion != "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	res.Roll = AttackRoll(s.RNG, skulls)
	defense, err := DefenseProfile(s, gd, tgtPob)
	if err != nil {
		return res, err
	}
	if Defeats(res.Roll, defense) {
		eliminated, err := attemptEliminatePawn(s, gd, targetID, "attack")
		if err != nil {
			return res, err
		}
		res.Eliminated = eliminated
	}
	if s.RulesVersion == "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	return res, nil
}

// eliminatePawn removes a pawn from the board and records it in the Eliminated
// pool (for a later Reboot). Attached cards are discarded and any bonus counters
// they held are returned to the owner.
func eliminatePawn(s *domain.GameState, pawnID string, definitions ...*domain.GameData) bool {
	var gd *domain.GameData
	if len(definitions) > 0 {
		gd = definitions[0]
	}
	return finalizePawnElimination(s, pawnID, gd, nil)
}

func finalizePawnElimination(s *domain.GameState, pawnID string, gd *domain.GameData, events *[]EngineEvent) bool {
	pawn := s.Cybernet.PawnByID(pawnID)
	if pawn == nil {
		return false
	}
	if s.RulesVersion != "" && gd == nil {
		panic("source lifecycle elimination requires GameData")
	}
	journal := phaseEventSink([]*[]EngineEvent{events})
	retained := s.RulesVersion == ""
	if gd != nil {
		if def, ok := gd.PawnByID(pawnID); ok && effectiveAbility(gd, def, pawn.Attachments, "reboot") != nil {
			retained = true
		}
	}
	cardID, previousOwner := "", ""
	for _, card := range s.ControlCards {
		if card.Subject.Kind == "pawn" && card.Subject.ID == pawnID {
			cardID = card.CardID
			previousOwner = card.OwnerID
		}
	}
	cards := []string{}
	for _, att := range pawn.Attachments {
		cards = append(cards, att.CardID)
	}
	s.Cybernet.RemovePawn(pawnID)
	*journal = append(*journal, EngineEvent{Type: EventElimination, PawnID: pawnID})
	if retained {
		if !containsString(s.Eliminated, pawnID) {
			s.Eliminated = append(s.Eliminated, pawnID)
		}
	} else {
		for i, id := range s.Eliminated {
			if id == pawnID {
				s.Eliminated = append(s.Eliminated[:i], s.Eliminated[i+1:]...)
				break
			}
		}
		if !containsString(s.Reserve, pawnID) {
			s.Reserve = append(s.Reserve, pawnID)
		}
		*journal = append(*journal, EngineEvent{Type: "pawn-returned-to-reserve", PawnID: pawnID})
	}
	discardAttachments(s, pawn)
	for _, id := range cards {
		*journal = append(*journal, EngineEvent{Type: "card-discarded", CardID: id})
	}
	if !retained {
		SetPawnControl(s, pawnID, "")
		if previousOwner != "" {
			*journal = append(*journal, EngineEvent{Type: "control-card-released", PlayerID: previousOwner, CardID: cardID, PawnID: pawnID})
		}
	}
	return true
}

// MultiTargetResult is the outcome for one target of a multi-target Delete assignment.
type MultiTargetResult struct {
	TargetPawnID string `json:"targetPawnId"`
	Dice         []int  `json:"dice"`
	Eliminated   bool   `json:"eliminated"`
}

// DeleteMultiResult reports a multi-target Delete: the full roll and per-target
// outcomes.
type DeleteMultiResult struct {
	Roll    []int               `json:"roll"`
	Targets []MultiTargetResult `json:"targets"`
}

// AreaTargetResult is the outcome for one pawn in an area attack.
type AreaTargetResult struct {
	TargetPawnID string `json:"targetPawnId"`
	Eliminated   bool   `json:"eliminated"`
}

// DeleteAreaResult reports a Bomb-class area Delete: one shared roll applied to
// every pawn in the attacker's block.
type DeleteAreaResult struct {
	Coord   domain.Coord       `json:"coord"`
	Roll    []int              `json:"roll"`
	Targets []AreaTargetResult `json:"targets"`
}

func resolveDeleteAreaAtCoord(s *domain.GameState, gd *domain.GameData, coord domain.Coord, skulls int) (DeleteAreaResult, error) {
	res := DeleteAreaResult{Coord: coord}
	res.Roll = AttackRoll(s.RNG, skulls)
	eliminatedIDs := []string{}
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.Coord != coord {
			continue
		}
		_, ok := gd.PawnByID(pawn.PawnID)
		defense, err := DefenseProfile(s, gd, pawn)
		if err != nil {
			return res, err
		}
		eliminated := ok && Defeats(res.Roll, defense)
		res.Targets = append(res.Targets, AreaTargetResult{TargetPawnID: pawn.PawnID, Eliminated: eliminated})
		if eliminated {
			eliminatedIDs = append(eliminatedIDs, pawn.PawnID)
		}
	}
	for _, pawnID := range eliminatedIDs {
		eliminated, err := attemptEliminatePawn(s, gd, pawnID, "attack")
		if err != nil {
			return res, err
		}
		for i := range res.Targets {
			if res.Targets[i].TargetPawnID == pawnID {
				res.Targets[i].Eliminated = eliminated
			}
		}
	}
	return res, nil
}

// DeleteMulti resolves a single Delete attack roll split across several co-located
// targets (Speedrunners / Shadowraiders "Combat Against Multiple Threats"). The
// attacker rolls one die per skull; the first len(targetIDs) dice are assigned in
// order. A target may appear more than once so multiple dice can be concentrated
// on it. A target is eliminated if any die assigned to it matches an unshielded
// defense die.
//
// SCOPE: area attacks are a later refinement — tracked in tasks/BACKLOG.md.
func DeleteMulti(s *domain.GameState, gd *domain.GameData, attackerID string, targetIDs []string, extraSkulls int, activations ...string) (DeleteMultiResult, error) {
	var res DeleteMultiResult
	if len(targetIDs) == 0 {
		return res, fmt.Errorf("no targets given")
	}
	atkPob := s.Cybernet.PawnByID(attackerID)
	if atkPob == nil {
		return res, fmt.Errorf("attacker %q is not on the board", attackerID)
	}
	atk, ok := gd.PawnByID(attackerID)
	if !ok {
		return res, fmt.Errorf("unknown attacker pawn %q", attackerID)
	}
	ability := effectiveAbility(gd, atk, atkPob.Attachments, "delete")
	if gd.RegressionFixture != "provisional-v1" {
		activation := "once-per-turn"
		if len(activations) > 0 {
			activation = activations[0]
		}
		var err error
		ability, err = requireDeleteActivation(gd, atk, atkPob.Attachments, activation)
		if err != nil {
			return res, err
		}
	}
	if ability == nil || ability.Activation == "none" {
		return res, fmt.Errorf("pawn %q cannot activate Delete", attackerID)
	}
	owner := s.PlayerByID(atkPob.OwnerID)
	if owner == nil {
		return res, fmt.Errorf("attacker %q has no controlling player", attackerID)
	}
	if ability.Activation == "once-per-turn" && AbilityUseSpent(s, gd, owner, attackerID, "delete") {
		return res, fmt.Errorf("pawn %q already used its once-per-turn Delete this turn", attackerID)
	}

	skulls := EffectiveAttackSkulls(gd, s, attackerID, ability.Skulls)
	skulls += extraSkulls
	if len(targetIDs) > skulls {
		return res, fmt.Errorf("cannot attack %d targets with only %d skull(s)", len(targetIDs), skulls)
	}

	// Validate targets: on the board, co-located, not the attacker. A target
	// may appear more than once to concentrate several dice on it.
	for _, tid := range targetIDs {
		if tid == attackerID {
			return res, fmt.Errorf("a pawn cannot Delete itself")
		}
		tPob := s.Cybernet.PawnByID(tid)
		if tPob == nil {
			return res, fmt.Errorf("target %q is not on the board", tid)
		}
		if tPob.Coord != atkPob.Coord {
			return res, fmt.Errorf("target %q is not in the same block", tid)
		}
	}

	if s.RulesVersion != "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	res.Roll = AttackRoll(s.RNG, skulls)
	diceByTarget := map[string][]int{}
	targetOrder := []string{}
	for i, tid := range targetIDs {
		if _, ok := diceByTarget[tid]; !ok {
			targetOrder = append(targetOrder, tid)
		}
		diceByTarget[tid] = append(diceByTarget[tid], res.Roll[i])
	}
	for _, tid := range targetOrder {
		dice := diceByTarget[tid]
		defense, err := DefenseProfile(s, gd, s.Cybernet.PawnByID(tid))
		if err != nil {
			return res, err
		}
		eliminated := s.Cybernet.PawnByID(tid) != nil && Defeats(dice, defense)
		res.Targets = append(res.Targets, MultiTargetResult{TargetPawnID: tid, Dice: dice, Eliminated: eliminated})
		if eliminated {
			eliminated, err := attemptEliminatePawn(s, gd, tid, "attack")
			if err != nil {
				return res, err
			}
			res.Targets[len(res.Targets)-1].Eliminated = eliminated
		}
	}
	if s.RulesVersion == "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	return res, nil
}

// DeleteArea resolves a Bomb-class area Delete against every pawn in the
// attacker's block. The same attack roll is applied to every pawn in the area of
// effect, including the attacker when present in that block.
func DeleteArea(s *domain.GameState, gd *domain.GameData, attackerID string, extraSkulls int, activations ...string) (DeleteAreaResult, error) {
	var res DeleteAreaResult
	atkPob := s.Cybernet.PawnByID(attackerID)
	if atkPob == nil {
		return res, fmt.Errorf("attacker %q is not on the board", attackerID)
	}
	atk, ok := gd.PawnByID(attackerID)
	if !ok {
		return res, fmt.Errorf("unknown attacker pawn %q", attackerID)
	}
	if !containsString(EffectivePawnClasses(gd, atkPob), "bomb") {
		return res, fmt.Errorf("pawn %q cannot activate an area Delete", attackerID)
	}

	ability := effectiveAbility(gd, atk, atkPob.Attachments, "delete")
	if gd.RegressionFixture != "provisional-v1" {
		activation := "once-per-turn"
		if len(activations) > 0 {
			activation = activations[0]
		}
		var err error
		ability, err = requireDeleteActivation(gd, atk, atkPob.Attachments, activation)
		if err != nil {
			return res, err
		}
	}
	if ability == nil || ability.Activation == "none" {
		return res, fmt.Errorf("pawn %q cannot activate Delete", attackerID)
	}
	owner := s.PlayerByID(atkPob.OwnerID)
	if owner == nil {
		return res, fmt.Errorf("attacker %q has no controlling player", attackerID)
	}
	if ability.Activation == "once-per-turn" && AbilityUseSpent(s, gd, owner, attackerID, "delete") {
		return res, fmt.Errorf("pawn %q already used its once-per-turn Delete this turn", attackerID)
	}

	skulls := EffectiveAttackSkulls(gd, s, attackerID, ability.Skulls)
	skulls += extraSkulls
	var err error
	if s.RulesVersion != "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	res, err = resolveDeleteAreaAtCoord(s, gd, atkPob.Coord, skulls)
	if err != nil {
		return res, err
	}
	if s.RulesVersion == "" && ability.Activation == "once-per-turn" {
		SpendAbilityUse(s, gd, owner, attackerID, "delete")
	}
	return res, nil
}
