package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type MovementRollResult struct {
	Roll []int `json:"roll"`
}

func RolledMovementError(s *domain.GameState, gd *domain.GameData, a Action) error {
	if gd.RegressionFixture == "provisional-v1" {
		return fmt.Errorf("rolled movement decisions require source rules")
	}
	if s.WinnerID != "" || s.Phase != domain.PhaseAction || s.PendingChoice != nil || s.PendingPhase != "" || s.PendingAttack != nil || s.PendingThreats != nil {
		return fmt.Errorf("resolve pending work before activating movement")
	}
	if len(a.Path) > 0 || a.OptionID != "" || a.ChoiceID != "" || a.Coord != nil || a.SpaceID != "" || a.TargetID != "" || len(a.TargetIDs) > 0 || len(a.CardIDs) > 0 {
		return fmt.Errorf("choose the movement path after the roll")
	}
	placed := s.Cybernet.PawnByID(a.PawnID)
	pawn, ok := gd.PawnByID(a.PawnID)
	player := s.CurrentPlayerPtr()
	if placed == nil || !ok || placed.OwnerID != player.ID || (a.PlayerID != "" && a.PlayerID != player.ID) {
		return fmt.Errorf("only the active player's controlled pawn may move")
	}
	option, err := MovementOptionAt(gd, pawn, placed.Attachments, a.MovementIndex)
	if err != nil {
		return fmt.Errorf("selected movement is unavailable")
	}
	if option.Movement.Type != "d6" && option.Movement.Type != "2d6" {
		return fmt.Errorf("select a die-based movement ability")
	}
	if option.RolledPerTurn != "" {
		return fmt.Errorf("unsupported source rolled movement-use budget")
	}
	if option.Movement.Activation == "card" {
		card := cardByID(gd, a.CardID)
		if a.CardID == "" || !cardInHand(player, a.CardID) || card == nil || card.Movement <= 0 {
			return fmt.Errorf("this movement requires a movement card in hand")
		}
	} else if a.CardID != "" {
		return fmt.Errorf("free movement cannot also play a card")
	}
	return CanActivateMovementOption(s, player, pawn.ID, option)
}

// BeginRolledMovement commits activation, then publishes dice before any path choice.
func BeginRolledMovement(s *domain.GameState, gd *domain.GameData, a Action) (MovementRollResult, error) {
	result := MovementRollResult{}
	if err := RolledMovementError(s, gd, a); err != nil {
		return result, err
	}
	placed := s.Cybernet.PawnByID(a.PawnID)
	pawn, _ := gd.PawnByID(a.PawnID)
	player := s.CurrentPlayerPtr()
	option, _ := MovementOptionAt(gd, pawn, placed.Attachments, a.MovementIndex)
	if a.CardID != "" {
		if err := consumeCard(s, player, a.CardID); err != nil {
			return result, err
		}
	}
	if option.PerTurnUses > 0 {
		if err := consumeGrantedMovementUse(s, player, pawn.ID, option); err != nil {
			return result, err
		}
	} else if option.Movement.Activation == "once-per-turn" {
		SpendMovementUse(s, pawn.ID, option.AttachmentIndex, option.GrantIndex)
	}
	dice := 1
	if option.Movement.Type == "2d6" {
		dice = 2
	}
	budget := MovementStepModifier(gd, placed)
	roll := []int{}
	for i := 0; i < dice; i++ {
		die := s.RNG.Intn(6) + 1
		roll = append(roll, die)
		budget += die
	}
	if budget < 0 {
		budget = 0
	}
	s.DecisionSerial++
	id := fmt.Sprintf("movement-%d", s.DecisionSerial)
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: player.ID, Kind: "move-path", EffectID: id, PawnID: pawn.ID, CardID: a.CardID, Movement: &domain.PendingMovement{Roll: append([]int{}, roll...), Budget: budget, Origin: domain.MovementOrigin{Coord: placed.Coord, SpaceID: placed.SpaceID}, MovementIndex: a.MovementIndex, MovementKey: option.Key, Stealth: option.Stealth}}
	return MovementRollResult{Roll: roll}, nil
}

func movementThreatening(s *domain.GameState, gd *domain.GameData, coord domain.Coord, pawnID string, stealth bool) bool {
	pawn, _ := gd.PawnByID(pawnID)
	if stealth || (pawn != nil && pawn.Special == "does-not-activate-threats") {
		return false
	}
	for _, t := range s.Threats {
		if t.Status != "eliminated" && t.Coord == coord {
			return true
		}
	}
	return false
}

type MovementChoiceProjection struct {
	PawnID      string     `json:"pawnId"`
	Roll        []int      `json:"roll"`
	Budget      int        `json:"budget"`
	Path        []SpaceRef `json:"path"`
	CanFinish   bool       `json:"canFinish"`
	EndError    string     `json:"endError"`
	NextTargets []SpaceRef `json:"nextTargets"`
}

// MovementChoicePreview validates prefixes without mutation or RNG and permits pass-through occupancy.
func MovementChoicePreview(s *domain.GameState, gd *domain.GameData, path []SpaceRef) (MovementChoiceProjection, error) {
	out := MovementChoiceProjection{}
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "move-path" || choice.Movement == nil {
		return out, fmt.Errorf("no rolled movement path is pending")
	}
	m := choice.Movement
	pawn := s.Cybernet.PawnByID(choice.PawnID)
	definition, ok := gd.PawnByID(choice.PawnID)
	if pawn == nil || !ok || pawn.OwnerID != choice.PlayerID || pawn.Coord != m.Origin.Coord || pawn.SpaceID != m.Origin.SpaceID {
		return out, fmt.Errorf("the moving pawn or origin is unavailable")
	}
	option, err := MovementOptionAt(gd, definition, pawn.Attachments, m.MovementIndex)
	if err != nil {
		return out, err
	}
	if option.Key != m.MovementKey || (option.Movement.Type != "d6" && option.Movement.Type != "2d6") {
		return out, fmt.Errorf("the committed movement ability is unavailable")
	}
	if len(path) > m.Budget {
		return out, fmt.Errorf("path of %d steps exceeds the movement budget of %d", len(path), m.Budget)
	}
	coord, spaceID := m.Origin.Coord, m.Origin.SpaceID
	for i, step := range path {
		reachable := false
		for _, target := range StepTargets(gd, s.Cybernet, coord, spaceID, choice.PawnID) {
			if target.Coord == step.Coord && target.SpaceID == step.SpaceID {
				reachable = true
				break
			}
		}
		if !reachable {
			return out, fmt.Errorf("step %d is not adjacent or permitted", i+1)
		}
		if i < len(path)-1 && movementThreatening(s, gd, step.Coord, choice.PawnID, m.Stealth) {
			return out, fmt.Errorf("movement must stop at the first threatening block")
		}
		coord, spaceID = step.Coord, step.SpaceID
	}
	endError := ""
	if err := CanEndOn(gd, s.Cybernet, coord, spaceID, choice.PawnID); err != nil {
		endError = err.Error()
	}
	if endError == "" && len(path) > 0 {
		if err := SpaceStopError(s, gd, choice.PawnID, SpaceRef{Coord: coord, SpaceID: spaceID}); err != nil {
			endError = err.Error()
		}
	}
	next := []SpaceRef{}
	if len(path) < m.Budget && !(len(path) > 0 && movementThreatening(s, gd, coord, choice.PawnID, m.Stealth)) {
		next = append(next, StepTargets(gd, s.Cybernet, coord, spaceID, choice.PawnID)...)
	}
	return MovementChoiceProjection{choice.PawnID, append([]int{}, m.Roll...), m.Budget, append([]SpaceRef{}, path...), endError == "", endError, next}, nil
}

func ResolveMovementChoice(s *domain.GameState, gd *domain.GameData, a Action, eventSinks ...*[]EngineEvent) error {
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "move-path" || choice.Movement == nil || a.ChoiceID != choice.ID || a.OptionID != "move" {
		return fmt.Errorf("choose the current rolled movement path or stop")
	}
	m := choice.Movement
	if a.CardID != "" || len(a.CardIDs) > 0 || a.TargetID != "" || len(a.TargetIDs) > 0 || a.Coord != nil || a.SpaceID != "" || (a.PawnID != "" && a.PawnID != choice.PawnID) {
		return fmt.Errorf("a movement response cannot change targets or pay again")
	}
	preview, err := MovementChoicePreview(s, gd, a.Path)
	if err != nil {
		return err
	}
	if !preview.CanFinish {
		return fmt.Errorf("%s", preview.EndError)
	}
	if len(a.Path) > 0 {
		pawn, err := MovePathWithBudget(s, gd, choice.PawnID, a.Path, m.Budget, false)
		if err != nil {
			return err
		}
		coord := pawn.Coord
		events := phaseEventSink(eventSinks)
		*events = append(*events, EngineEvent{Type: "pawn-moved", PlayerID: choice.PlayerID, PawnID: choice.PawnID, Coord: &coord, SpaceID: pawn.SpaceID})
	}
	s.PendingChoice = nil
	if len(a.Path) > 0 {
		AwakenThreats(s, gd, choice.PawnID, m.Stealth)
		if err := OfferSpaceEffect(s, gd, choice.PawnID); err != nil {
			return err
		}
	}
	return nil
}
