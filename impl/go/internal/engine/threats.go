package engine

// Shadowraiders pp.20–25. Mirrors threats.ts; combat faces come from shared data.
import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func threatDef(gd *domain.GameData, id string) *domain.Threat {
	for i := range gd.Threats {
		if gd.Threats[i].ID == id {
			return &gd.Threats[i]
		}
	}
	return nil
}
func threatsAt(s *domain.GameState, c domain.Coord) []*domain.ThreatOnBoard {
	out := []*domain.ThreatOnBoard{}
	for i := range s.Threats {
		if s.Threats[i].Coord == c {
			out = append(out, &s.Threats[i])
		}
	}
	return out
}
func DeployThreats(s *domain.GameState, gd *domain.GameData, c domain.Coord) error {
	pb := s.Cybernet.At(c)
	if pb == nil {
		return fmt.Errorf("unknown threat block")
	}
	b, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return fmt.Errorf("unknown threat block")
	}
	for _, sp := range b.Spaces {
		id := fmt.Sprintf("%d,%d:%s", c.Q, c.R, sp.ID)
		if abilityListHas(s.ClearedEvents, id) {
			continue
		}
		exists := false
		for _, t := range s.Threats {
			if t.ID == id {
				exists = true
			}
		}
		if exists {
			continue
		}
		tid := sp.ThreatID
		if tid == "" && sp.Type == "event" && len(s.ThreatPile) > 0 {
			tid = s.ThreatPile[len(s.ThreatPile)-1]
			s.ThreatPile = s.ThreatPile[:len(s.ThreatPile)-1]
		}
		if tid == "" {
			continue
		}
		def := threatDef(gd, tid)
		if def == nil || len(def.Defense) == 0 || def.AttackDie == 0 {
			return fmt.Errorf("threat %q needs sourced combat data", tid)
		}
		s.Threats = append(s.Threats, domain.ThreatOnBoard{ID: id, ThreatID: tid, Coord: c, SpaceID: sp.ID, Status: "inactive"})
	}
	return nil
}
func AwakenThreats(s *domain.GameState, gd *domain.GameData, pawnID string, stealth bool) bool {
	p := s.Cybernet.PawnByID(pawnID)
	if p == nil || stealth {
		return false
	}
	def, _ := gd.PawnByID(pawnID)
	if def != nil && def.Special == "does-not-activate-threats" {
		return false
	}
	found := false
	for _, t := range threatsAt(s, p.Coord) {
		if t.Status != "eliminated" {
			t.Status = "active"
			found = true
		}
	}
	if found {
		s.PendingThreats = &domain.PendingThreatCombat{Coord: p.Coord, AttackerIDs: []string{}, Stage: "response"}
	}
	return found
}

type PublicAttackResult struct {
	Roll []int `json:"roll"`
}

func RollDelete(s *domain.GameState, gd *domain.GameData, pawnID, cardID string, joint bool, playerIDs ...string) (PublicAttackResult, error) {
	fail := func(msg string) (PublicAttackResult, error) { return PublicAttackResult{}, fmt.Errorf("%s", msg) }
	if s.PendingAttack != nil {
		return fail("assign the previous roll first")
	}
	if s.PendingThreats != nil && s.PendingThreats.Stage == "retaliation" {
		return fail("resolve the threat attack first")
	}
	player := s.CurrentPlayerPtr()
	if len(playerIDs) > 0 && playerIDs[0] != "" {
		player = s.PlayerByID(playerIDs[0])
	}
	if player == nil {
		return fail("unknown attacking controller")
	}
	actor := s.Cybernet.PawnByID(pawnID)
	if actor == nil || actor.OwnerID != player.ID {
		return fail("select a controlled attacker")
	}
	if s.PendingThreats != nil && s.PendingThreats.Coord != actor.Coord {
		return fail("respond in the threatened block")
	}
	source := gd.RegressionFixture != "provisional-v1"
	activation := "once-per-turn"
	if cardID != "" {
		activation = "card"
	}
	if source {
		if joint {
			present := false
			for _, threat := range threatsAt(s, actor.Coord) {
				present = present || threat.Status != "eliminated"
			}
			if !present {
				return fail("joint attacks require threats in the block")
			}
		}
		def, ok := gd.PawnByID(pawnID)
		if !ok {
			return fail("unknown attacker")
		}
		if _, err := requireDeleteActivation(gd, def, actor.Attachments, activation); err != nil {
			return fail(err.Error())
		}
	}
	attackers := []*domain.PawnOnBoard{actor}
	if joint {
		attackers = []*domain.PawnOnBoard{}
		for _, p := range s.Cybernet.Pawns {
			def, _ := gd.PawnByID(p.PawnID)
			if p.OwnerID != player.ID || p.Coord != actor.Coord || def == nil {
				continue
			}
			if source {
				if PawnDeleteProfile(gd, def, p.Attachments).Skulls > 0 {
					attackers = append(attackers, p)
				}
			} else if effectiveAbility(gd, def, p.Attachments, "delete") != nil {
				attackers = append(attackers, p)
			}
		}
	}
	skulls := 0
	for _, p := range attackers {
		def, _ := gd.PawnByID(p.PawnID)
		if def == nil {
			return fail("unknown attacker")
		}
		ab := effectiveAbility(gd, def, p.Attachments, "delete")
		if source {
			selected := "none"
			if p.PawnID == pawnID {
				selected = activation
			}
			ab = &domain.Ability{Ability: "delete", Activation: selected, Skulls: PawnDeleteProfile(gd, def, p.Attachments).Skulls}
		}
		if ab == nil || (!source && ab.Activation == "none") {
			return fail("attacker has no Delete ability")
		}
		if ab.Activation == "once-per-turn" && AbilityUseSpent(s, gd, player, p.PawnID, "delete") {
			return fail("Delete already used this turn")
		}
		if !source && cardID == "" && ab.Activation != "once-per-turn" {
			return fail("Delete requires a matching card")
		}
		skulls += EffectiveAttackSkulls(gd, s, p.PawnID, ab.Skulls)
	}
	if cardID != "" {
		c := cardByID(gd, cardID)
		if !cardInHand(player, cardID) || c == nil || !abilityListHas(c.Activates, "delete") {
			return fail("select a Delete card in hand")
		}
		_ = consumeCard(s, player, cardID)
	}
	ids := []string{}
	for _, p := range attackers {
		ids = append(ids, p.PawnID)
		if source {
			if p.PawnID == pawnID && activation == "once-per-turn" {
				SpendAbilityUse(s, gd, player, p.PawnID, "delete")
			}
		} else {
			def, _ := gd.PawnByID(p.PawnID)
			ab := effectiveAbility(gd, def, p.Attachments, "delete")
			if ab.Activation == "once-per-turn" {
				SpendAbilityUse(s, gd, player, p.PawnID, "delete")
			}
		}
	}
	roll := AttackRoll(s.RNG, skulls)
	AwakenThreats(s, gd, pawnID, false)
	s.PendingAttack = &domain.PendingAttack{PlayerID: player.ID, AttackerIDs: ids, Coord: actor.Coord, Roll: roll}
	if s.PendingThreats != nil {
		s.PendingThreats.AttackerIDs = ids
	}
	return PublicAttackResult{roll}, nil
}
func AssignDelete(s *domain.GameState, gd *domain.GameData, targets []string) error {
	p := s.PendingAttack
	if p == nil || s.PlayerByID(p.PlayerID) == nil {
		return fmt.Errorf("no attack roll to assign")
	}
	if len(targets) != len(p.Roll) {
		return fmt.Errorf("assign every rolled die; use an empty target to discard it")
	}
	hits := []string{}
	for i, id := range targets {
		if id == "" {
			continue
		}
		pawn := s.Cybernet.PawnByID(id)
		var threat *domain.ThreatOnBoard
		for _, t := range threatsAt(s, p.Coord) {
			if t.ID == id && t.Status != "eliminated" {
				threat = t
			}
		}
		hit := false
		if pawn != nil && pawn.Coord == p.Coord && !abilityListHas(p.AttackerIDs, id) {
			defense, err := DefenseProfile(s, gd, pawn)
			if err != nil {
				return err
			}
			hit = Defeats([]int{p.Roll[i]}, defense)
		} else if threat != nil {
			def := threatDef(gd, threat.ThreatID)
			if def == nil || len(def.Defense) == 0 {
				return fmt.Errorf("threat has no defense data")
			}
			hit = Defeats([]int{p.Roll[i]}, def.Defense)
		} else {
			return fmt.Errorf("each target must be in the attack block")
		}
		if hit && !abilityListHas(hits, id) {
			hits = append(hits, id)
		}
	}
	for _, id := range hits {
		found := false
		for i := range s.Threats {
			if s.Threats[i].ID == id {
				s.Threats[i].Status = "eliminated"
				found = true
			}
		}
		if !found {
			if _, err := attemptEliminatePawn(s, gd, id, "attack"); err != nil {
				return err
			}
		}
	}
	s.PendingAttack = nil
	if s.PendingThreats != nil {
		active := false
		for _, t := range threatsAt(s, p.Coord) {
			if t.Status == "active" {
				active = true
			}
		}
		if active {
			s.PendingThreats.Stage = "retaliation"
		} else {
			s.PendingThreats = nil
		}
	}
	return nil
}
func AssignThreatAttack(s *domain.GameState, gd *domain.GameData, targets []string) (PublicAttackResult, error) {
	fail := func(msg string) (PublicAttackResult, error) { return PublicAttackResult{}, fmt.Errorf("%s", msg) }
	p := s.PendingThreats
	if p == nil || s.PendingAttack != nil {
		return fail("no threat attack is ready")
	}
	active := []*domain.ThreatOnBoard{}
	for _, t := range threatsAt(s, p.Coord) {
		if t.Status == "active" {
			active = append(active, t)
		}
	}
	if len(targets) != len(active) {
		return fail("assign one target per active threat")
	}
	own := []string{}
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.Coord == p.Coord && pawn.OwnerID == s.CurrentPlayerPtr().ID {
			own = append(own, pawn.PawnID)
		}
	}
	attackers := []string{}
	for _, id := range p.AttackerIDs {
		if abilityListHas(own, id) {
			attackers = append(attackers, id)
		}
	}
	if len(targets) >= len(own) {
		for _, id := range own {
			if !abilityListHas(targets, id) {
				return fail("assign at least one die to each controlled pawn first")
			}
		}
	} else {
		for _, id := range targets {
			if !abilityListHas(own, id) {
				return fail("controlled pawns take priority")
			}
		}
		if len(targets) >= len(attackers) {
			for _, id := range attackers {
				if !abilityListHas(targets, id) {
					return fail("attacking pawns take priority")
				}
			}
		} else {
			for _, id := range targets {
				if !abilityListHas(attackers, id) {
					return fail("attacking pawns take priority")
				}
			}
		}
	}
	seen := map[string]bool{}
	for _, id := range targets {
		if abilityListHas(own, id) {
			seen[id] = true
		}
	}
	min := len(own)
	if len(targets) < min {
		min = len(targets)
	}
	if len(seen) < min {
		return fail("distribute one die per controlled pawn before concentrating")
	}
	roll := []int{}
	hits := []string{}
	for i, t := range active {
		def := threatDef(gd, t.ThreatID)
		if def == nil || def.AttackDie == 0 {
			return fail("threat has no attack die")
		}
		roll = append(roll, def.AttackDie)
		pawn := s.Cybernet.PawnByID(targets[i])
		if pawn == nil || pawn.Coord != p.Coord {
			return fail("threat targets must be pawns in this block")
		}
		defense, err := DefenseProfile(s, gd, pawn)
		if err != nil {
			return PublicAttackResult{}, err
		}
		if Defeats([]int{def.AttackDie}, defense) && !abilityListHas(hits, pawn.PawnID) {
			hits = append(hits, pawn.PawnID)
		}
	}
	for _, id := range hits {
		if _, err := attemptEliminatePawn(s, gd, id, "attack"); err != nil {
			return PublicAttackResult{}, err
		}
	}
	for _, t := range active {
		t.Status = "inactive"
	}
	s.PendingThreats = nil
	return PublicAttackResult{roll}, nil
}
func CollectThreat(s *domain.GameState, gd *domain.GameData, pawnID, targetID string) error {
	p := s.Cybernet.PawnByID(pawnID)
	var target *domain.ThreatOnBoard
	index := -1
	for i := range s.Threats {
		if s.Threats[i].ID == targetID {
			target = &s.Threats[i]
			index = i
		}
	}
	if p == nil || p.OwnerID != s.CurrentPlayerPtr().ID || target == nil || p.Coord != target.Coord {
		return fmt.Errorf("select a defeated token in your pawn's block")
	}
	def := threatDef(gd, target.ThreatID)
	if target.Status != "eliminated" || def == nil || def.Type != "token" {
		return fmt.Errorf("only defeated threat tokens can be collected")
	}
	for _, t := range threatsAt(s, target.Coord) {
		if t.Status != "eliminated" {
			return fmt.Errorf("clear the other threats before collecting")
		}
	}
	if err := GrantBonusCounters(s, s.CurrentPlayerPtr().ID, 1); err != nil {
		return err
	}
	key := fmt.Sprintf("%d,%d:%s", target.Coord.Q, target.Coord.R, target.SpaceID)
	if !abilityListHas(s.ClearedEvents, key) {
		s.ClearedEvents = append(s.ClearedEvents, key)
	}
	s.Threats = append(s.Threats[:index], s.Threats[index+1:]...)

	return nil
}
func ResetThreats(s *domain.GameState) {
	for i := range s.Threats {
		s.Threats[i].Status = "inactive"
	}
}
