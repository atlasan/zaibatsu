// Package engine is the Zaibatsu rules engine: setup and the turn-phase state
// machine. It is a pure reducer (state Ã— action â†’ state) with no I/O. It mirrors
// impl/ts/src/engine. See DOCS/turn-flow.md and DOCS/parity.md.
package engine

import (
	"encoding/json"
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Config describes a new game to set up.
type Config struct {
	Data             *domain.GameData
	PlayerNames      []string
	Seed             uint64
	AllowProvisional bool
}

// ActionType enumerates the player actions the engine understands. Each maps to
// a resolver; Apply dispatches on it. See DOCS/architecture.md ("State & actions").
type ActionType string

const (
	ActRollMovement       ActionType = "roll-movement"
	ActRollDelete         ActionType = "roll-delete"
	ActResolveChoice      ActionType = "resolve-choice"
	ActAssignDelete       ActionType = "assign-delete"
	ActAssignThreatAttack ActionType = "assign-threat-attack"
	ActCollectThreat      ActionType = "collect-threat"
	ActRecycle            ActionType = "recycle"
	ActPass               ActionType = "pass"
	ActPlaceMarker        ActionType = "place-marker" // direct marker placement (utility)
	ActMoveHex            ActionType = "move-hex"
	ActMoveSteps          ActionType = "move-steps"
	ActDelete             ActionType = "delete"
	ActDeleteArea         ActionType = "delete-area"
	ActDeleteMulti        ActionType = "delete-multi"
	ActIcebreakBlk        ActionType = "icebreak-block"
	ActIcebreakPawn       ActionType = "icebreak-pawn"
	ActSearch             ActionType = "search"
	ActReboot             ActionType = "reboot"
	// Card-driven variants (consume cards from hand).
	ActPlayDelete       ActionType = "play-delete"
	ActPlayDeleteMulti  ActionType = "play-delete-multi"
	ActPlayDeleteArea   ActionType = "play-delete-area"
	ActPlayMove         ActionType = "play-move"
	ActPlayIcebreakBlk  ActionType = "play-icebreak-block"
	ActPlayIcebreakPawn ActionType = "play-icebreak-pawn"
	ActPlaySearch       ActionType = "play-search"
	ActPlayRebootCard   ActionType = "play-reboot-card"
	ActPlayReboot       ActionType = "play-reboot"
	ActAttachPawn       ActionType = "attach-pawn"
	ActAttachEnemy      ActionType = "attach-enemy"
	ActAttachBlock      ActionType = "attach-block"
)

// Action is a single player intent â€” a tagged union whose Type selects which
// fields are read. PlayerID defaults to the current player when empty. It mirrors
// impl/ts Action. Not every field applies to every Type.
type Action struct {
	AttachmentID  string        `json:"attachmentId,omitempty"`
	SlotRef       string        `json:"slotRef,omitempty"`
	SpaceID       string        `json:"spaceId,omitempty"`
	ChoiceID      string        `json:"choiceId,omitempty"`
	OptionID      string        `json:"optionId,omitempty"`
	Type          ActionType    `json:"type"`
	Joint         bool          `json:"joint,omitempty"`
	PlayerID      string        `json:"playerId,omitempty"`
	CardID        string        `json:"cardId,omitempty"`
	CardIDs       []string      `json:"cardIds,omitempty"`
	PawnID        string        `json:"pawnId,omitempty"`        // acting pawn (attacker/actor/searcher/rebooted)
	Path          []SpaceRef    `json:"path,omitempty"`          // declared space-to-space movement path
	MovementIndex int           `json:"movementIndex,omitempty"` // explicit movement option index: base=0, granted options follow attachment order
	TargetID      string        `json:"targetId,omitempty"`
	TargetIDs     []string      `json:"targetIds,omitempty"` // ordered die assignments for delete-multi; duplicates concentrate dice
	Coord         *domain.Coord `json:"coord,omitempty"`
	Dir           int           `json:"dir,omitempty"`
	Rotation      int           `json:"rotation,omitempty"`
	ExtraSkulls   int           `json:"extraSkulls,omitempty"`
	ExtraRollDice int           `json:"extraRollDice,omitempty"`
}

// EventType identifies a presentation-free engine event for local clients.
// It mirrors impl/ts/src/engine/index.ts.
type EventType string

const (
	EventBonusAwarded          EventType = "bonus-awarded"
	EventBonusCounterPlaced    EventType = "bonus-counter-placed"
	EventPawnSacrificeSelected EventType = "pawn-sacrifice-selected"
	EventBlockDrawn            EventType = "block-drawn"
	EventBlockPlaced           EventType = "block-placed"
	EventChoiceRequired        EventType = "choice-required"
	EventChoiceResolved        EventType = "choice-resolved"
	EventPhaseAdvanced         EventType = "phase-advanced"
	EventActionAccepted        EventType = "action-accepted"
	EventRoll                  EventType = "roll"
	EventDraw                  EventType = "draw"
	EventBonusIconCreated      EventType = "bonus-icon-created"
	EventBonusCollected        EventType = "bonus-collected"
	EventPawnPlaced            EventType = "pawn-placed"
	EventElimination           EventType = "elimination"
	EventControlChanged        EventType = "control-changed"
	EventValidationFail        EventType = "validation-failed"
	EventWinnerDeclared        EventType = "winner-declared"
)

// EngineEvent is structured output from phase transitions and accepted actions.
// Trusted journal: use EventsForPlayer before exposing history to a player.
type EngineEvent struct {
	CardRevealed bool          `json:"cardRevealed,omitempty"`
	Amount       int           `json:"amount,omitempty"`
	Coord        *domain.Coord `json:"coord,omitempty"`
	SpaceID      string        `json:"spaceId,omitempty"`
	Type         EventType     `json:"type"`
	PlayerID     string        `json:"playerId,omitempty"`
	ActionType   ActionType    `json:"actionType,omitempty"`
	FromPhase    domain.Phase  `json:"fromPhase,omitempty"`
	ToPhase      domain.Phase  `json:"toPhase,omitempty"`
	Roll         []int         `json:"roll,omitempty"`
	PawnID       string        `json:"pawnId,omitempty"`
	Element      string        `json:"element,omitempty"`
	ElementID    string        `json:"elementId,omitempty"`
	FromOwnerID  string        `json:"fromOwnerId,omitempty"`
	ToOwnerID    string        `json:"toOwnerId,omitempty"`
	CardID       string        `json:"cardId,omitempty"`
	Message      string        `json:"message,omitempty"`
}

// TransitionResult reports whether a phase advance or action was accepted.
type TransitionResult struct {
	Accepted bool          `json:"accepted"`
	Phase    domain.Phase  `json:"phase"`
	Events   []EngineEvent `json:"events"`
	Error    string        `json:"error,omitempty"`
}

var colors = []string{"red", "blue", "green", "yellow", "cyan", "magenta", "orange", "white"}

// ControlMarkersFor returns the control-marker allotment for a player count under
// the given mode, honoring the mode's per-count table and its "default".
func ControlMarkersFor(mode domain.Mode, n int) int {
	key := fmt.Sprintf("%d", n)
	if v, ok := mode.ControlMarkers[key]; ok {
		return v
	}
	if v, ok := mode.ControlMarkers["default"]; ok {
		return v
	}
	return 8
}

// starterPawnIDs returns the ids of the drawable starter pawns, in data order.
func starterPawnIDs(gd *domain.GameData) []string {
	var ids []string
	for _, p := range gd.Pawns {
		if p.IsStarter {
			ids = append(ids, p.ID)
		}
	}
	return ids
}

// buildDeck expands each action card by its copy count into a flat list of ids.
func buildDeck(gd *domain.GameData) []string {
	var deck []string
	for _, c := range gd.Cards {
		copies := c.Copies
		if copies < 1 {
			copies = 1
		}
		for i := 0; i < copies; i++ {
			deck = append(deck, c.ID)
		}
	}
	return deck
}

// buildBlockPile returns the non-core block ids.
func buildBlockPile(gd *domain.GameData) []string {
	var pile []string
	for _, b := range gd.Blocks {
		if !b.IsCentralCore {
			pile = append(pile, b.ID)
		}
	}
	return pile
}

// NewGame sets up a fresh game per the config and the mode rules.
func NewGame(cfg Config) (*domain.GameState, error) {
	if cfg.Data == nil {
		return nil, fmt.Errorf("NewGame: nil data")
	}
	n := len(cfg.PlayerNames)
	mode := cfg.Data.Mode
	if mode.BonusCounterSupply != nil && *mode.BonusCounterSupply < 0 {
		return nil, fmt.Errorf("invalid configured bonus-counter supply")
	}
	if cfg.Data.RegressionFixture != "" && cfg.Data.RegressionFixture != "provisional-v1" {
		return nil, fmt.Errorf("unsupported regression fixture")
	}
	for _, card := range cfg.Data.Cards {
		if cfg.Data.RegressionFixture != "provisional-v1" {
			if err := ValidateDeleteAttachment(card.Attach); err != nil {
				return nil, err
			}
			if err := ValidateAttachmentRules(&card); err != nil {
				return nil, err
			}
			if err := ValidateIcebreakerAttachment(card.Attach); err != nil {
				return nil, err
			}
		}
		if card.Attach != nil {
			if cfg.Data.RegressionFixture != "provisional-v1" && (len(card.Attach.Class) > 0 || len(card.Attach.ForbiddenClasses) > 0) && card.Attach.As != "pawn" && card.Attach.As != "enemy" {
				return nil, fmt.Errorf("target-class restrictions require a pawn or enemy attachment")
			}
			if card.Attach.EliminationPrevention != nil && card.Attach.EliminationPrevention.Kind != "discard-self" {
				return nil, fmt.Errorf("unsupported elimination prevention handler")
			}
			for _, effect := range card.Attach.PhaseEffects {
				if err := ValidatePhaseEffect(effect); err != nil {
					return nil, err
				}
			}
		}
	}
	if !cfg.AllowProvisional && cfg.Data.RegressionFixture != "provisional-v1" {
		for i := range cfg.Data.Blocks {
			if !SupportsSearchBlockEffect(&cfg.Data.Blocks[i]) {
				return nil, fmt.Errorf("unsupported block placement effects in official content")
			}
		}
	}
	if len(mode.Setup) > 0 {
		return nil, fmt.Errorf("unsupported mode setup step %q", mode.Setup[0])
	}
	for _, condition := range mode.Win {
		if condition != "all-control-markers-placed" {
			return nil, fmt.Errorf("unsupported win condition %q", condition)
		}
	}
	if len(mode.Lose) > 0 {
		return nil, fmt.Errorf("unsupported lose condition %q", mode.Lose[0])
	}
	if n < mode.Players.Min || n > mode.Players.Max {
		return nil, fmt.Errorf("mode %q supports %d-%d players, got %d", mode.ID, mode.Players.Min, mode.Players.Max, n)
	}

	if len(mode.AllowedPlayerCounts) > 0 {
		allowed := false
		for _, count := range mode.AllowedPlayerCounts {
			if n == count {
				allowed = true
			}
		}
		if !allowed {
			return nil, fmt.Errorf("mode %q does not support player count %d", mode.ID, n)
		}
	}
	if !mode.Provisional && !cfg.AllowProvisional {
		provisional := false
		for _, v := range cfg.Data.Blocks {
			provisional = provisional || v.Provisional
		}
		for _, v := range cfg.Data.Pawns {
			provisional = provisional || v.Provisional
		}
		for _, v := range cfg.Data.Cards {
			provisional = provisional || v.Provisional
		}
		for _, v := range cfg.Data.ControlCards {
			provisional = provisional || v.Provisional
		}
		for _, v := range cfg.Data.Threats {
			provisional = provisional || v.Provisional
		}
		for _, v := range cfg.Data.Missions {
			provisional = provisional || v.Provisional
		}
		if provisional {
			return nil, fmt.Errorf("official mode requires non-provisional content; use an explicit experimental profile or source-review fixture")
		}
	}
	rng := domain.NewRNG(cfg.Seed)

	// Assign starter pawns at random.
	if !cfg.AllowProvisional && !mode.Provisional {
		for _, card := range cfg.Data.Cards {
			if !SupportsAttachmentTiming(&card) {
				return nil, fmt.Errorf("unsupported attachment-time effects in official content")
			}
		}
		if cfg.Data.RegressionFixture == "" {
			for _, card := range cfg.Data.Cards {
				if HasLimitedAttachmentUses(&card) {
					return nil, fmt.Errorf("unresolved discarded-card use-marker lifetime in official content")
				}
			}
		}
	}
	if cfg.Data.RegressionFixture == "" {
		for i := range cfg.Data.Blocks {
			if err := ValidateControlledPlacement(&cfg.Data.Blocks[i], cfg.Data); err != nil {
				return nil, err
			}
			if err := ValidateMarkerHandDiscard(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateBlockDetach(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateHandSizeSpaces(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateBlockAttack(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateControllerCore(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateBlockBonus(&cfg.Data.Blocks[i], !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
			if err := ValidateGlobalBonusEffect(&cfg.Data.Blocks[i], !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
			if err := ValidateBlockSacrifices(&cfg.Data.Blocks[i], !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
			if err := ValidateSpaceEffects(&cfg.Data.Blocks[i], !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
			if err := ValidateSpaceArrows(&cfg.Data.Blocks[i]); err != nil {
				return nil, err
			}
			if err := ValidateBlockDefenseSpaces(&cfg.Data.Blocks[i], !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
		}
	}
	if cfg.Data.RegressionFixture == "" {
		for _, pawn := range cfg.Data.Pawns {
			if e := pawn.ControlMarkerEffect; e != nil && (e.Kind != "place-on-control-card" || e.Amount != 1) {
				return nil, fmt.Errorf("unsupported control-marker effect")
			}
		}
	}
	if cfg.Data.RegressionFixture == "" && !cfg.AllowProvisional && !mode.Provisional && mode.BonusCounterSupply == nil {
		return nil, fmt.Errorf("official mode requires a configured physical bonus-counter supply")
	}
	if cfg.Data.RegressionFixture == "" {
		for i := range cfg.Data.Pawns {
			if err := ValidateAbilityTurn(&cfg.Data.Pawns[i]); err != nil {
				return nil, err
			}
			if err := ValidatePawnPhaseEffects(&cfg.Data.Pawns[i], cfg.Data, !cfg.AllowProvisional && !mode.Provisional); err != nil {
				return nil, err
			}
		}
	}
	starters := starterPawnIDs(cfg.Data)
	if len(starters) < n {
		return nil, fmt.Errorf("not enough starter pawns (%d) for %d players", len(starters), n)
	}
	rng.Shuffle(starters)

	markers := ControlMarkersFor(mode, n)
	maxHand := mode.MaxHandSize
	if maxHand < 1 {
		maxHand = 5
	}

	players := make([]*domain.Player, n)
	for i, name := range cfg.PlayerNames {
		color := colors[i%len(colors)]
		if pawn, ok := cfg.Data.PawnByID(starters[i]); ok && pawn.Color != "" {
			color = pawn.Color
		}
		players[i] = &domain.Player{
			ID:                  fmt.Sprintf("p%d", i+1),
			Name:                name,
			Color:               color,
			PawnID:              starters[i],
			ControlMarkersTotal: markers,
			MaxHandSize:         maxHand,
			Hand:                []string{},
			OncePerTurnUsed:     map[string]bool{},
		}
	}

	deck := buildDeck(cfg.Data)
	rng.Shuffle(deck)
	blockPile := buildBlockPile(cfg.Data)
	rng.Shuffle(blockPile)

	// Seed the Cybernet with the Central Core at the origin. All pawns start here.
	core, ok := cfg.Data.CentralCore()
	if !ok {
		return nil, fmt.Errorf("no Central Core block in data")
	}
	cybernet := domain.NewCybernet()
	origin := domain.Coord{Q: 0, R: 0}
	cybernet.Blocks = append(cybernet.Blocks, &domain.PlacedBlock{
		BlockID:  core.ID,
		Rotation: 0,
		Coord:    origin,
	})
	// Each player's starting pawn begins on the Central Core. Its (special) space
	// has unlimited capacity, so all starting pawns share it.
	coreSpace := ""
	if len(core.Spaces) > 0 {
		coreSpace = core.Spaces[0].ID
	}
	for _, p := range players {
		cybernet.PlacePawn(&domain.PawnOnBoard{
			PawnID:  p.PawnID,
			OwnerID: p.ID,
			Coord:   origin,
			SpaceID: coreSpace,
		})
	}

	state := &domain.GameState{
		Players:       players,
		CurrentPlayer: 0,
		Turn:          1,
		Phase:         domain.PhaseBeginning,
		Deck:          deck,
		Discard:       []string{},
		PlayedCards:   []string{},
		BlockPile:     blockPile,
		Cybernet:      cybernet,
		Eliminated:    []string{},
		RNG:           rng,
	}

	if cfg.Data.RegressionFixture == "" {
		state.RulesVersion = "source-v21"
		if mode.BonusCounterSupply != nil {
			n := *mode.BonusCounterSupply
			state.BonusCounterSupply = &n
		}
		state.NativeUseMarkers = []domain.NativeUseMarker{}
		state.UnresolvedUseCards = []domain.Attachment{}
		state.Reserve = []string{}
		state.OutOfGame = []string{}
		for _, pawn := range cfg.Data.Pawns {
			if cybernet.PawnByID(pawn.ID) == nil {
				if pawn.IsStarter {
					state.OutOfGame = append(state.OutOfGame, pawn.ID)
				} else {
					state.Reserve = append(state.Reserve, pawn.ID)
				}
			}
		}
	}
	if len(cfg.Data.Threats) > 0 {
		state.Threats = []domain.ThreatOnBoard{}
		state.ThreatPile = []string{}
		for _, t := range cfg.Data.Threats {
			if t.Type == "token" {
				n := t.Copies
				if n < 1 {
					n = 1
				}
				for i := 0; i < n; i++ {
					state.ThreatPile = append(state.ThreatPile, t.ID)
				}
			}
		}
		rng.Shuffle(state.ThreatPile)
		if err := DeployThreats(state, cfg.Data, origin); err != nil {
			return nil, err
		}
	}
	for _, card := range cfg.Data.ControlCards {
		ownerID := ""
		for _, player := range players {
			if card.Subject.Kind == "pawn" && card.Subject.ID == player.PawnID {
				ownerID = player.ID
			}
		}
		zone := ""
		if state.RulesVersion != "" {
			zone = "common"
			if ownerID != "" {
				zone = "control"
			} else if card.Subject.Kind == "pawn" && containsString(state.OutOfGame, card.Subject.ID) {
				zone = "out-of-game"
			}
		}
		state.ControlCards = append(state.ControlCards, domain.ControlCardState{CardID: card.ID, Subject: card.Subject, OwnerID: ownerID, Zone: zone})
	}
	dealOpeningHands(state, mode)
	return state, nil
}

// dealOpeningHands applies the (asymmetric) opening deal by seat order.
func dealOpeningHands(s *domain.GameState, mode domain.Mode) {
	for i, p := range s.Players {
		count := mode.MaxHandSize
		if i < len(mode.StartingHand) {
			count = mode.StartingHand[i]
		}
		for j := 0; j < count; j++ {
			if card, ok := draw(s); ok {
				p.Hand = append(p.Hand, card)
			}
		}
	}
}

// draw pops one card from the deck, reshuffling the discard pile if the deck is
// empty. Returns false only if no cards exist anywhere.
func draw(s *domain.GameState) (string, bool) {
	if len(s.Deck) == 0 {
		if len(s.Discard) == 0 {
			return "", false
		}
		s.Deck = s.Discard
		s.Discard = []string{}
		s.RNG.Shuffle(s.Deck)
	}
	last := len(s.Deck) - 1
	card := s.Deck[last]
	s.Deck = s.Deck[:last]
	return card, true
}

// Apply validates and applies a single action, dispatching on its Type to the
// matching resolver. PlayerID defaults to the current player when empty. This is
// the engine's single reducer entry point (state Ã— action â†’ state).
func applyResult(s *domain.GameState, gd *domain.GameData, a Action, eventSinks ...*[]EngineEvent) (any, error) {
	effects := phaseEventSink(eventSinks)
	pid := a.PlayerID
	if pid == "" {
		pid = s.CurrentPlayerPtr().ID
	}
	coord := func() (domain.Coord, error) {
		if a.Coord == nil {
			return domain.Coord{}, fmt.Errorf("action %q requires a coord", a.Type)
		}
		return *a.Coord, nil
	}

	switch a.Type {
	case ActRollMovement:
		return BeginRolledMovement(s, gd, a)
	case ActRollDelete:
		return RollDelete(s, gd, a.PawnID, a.CardID, a.Joint, pid)
	case ActAssignDelete:
		return nil, AssignDelete(s, gd, a.TargetIDs)
	case ActAssignThreatAttack:
		return AssignThreatAttack(s, gd, a.TargetIDs)
	case ActCollectThreat:
		return nil, CollectThreat(s, gd, a.PawnID, a.TargetID)
	case ActRecycle:
		p := s.CurrentPlayerPtr()
		if !handContainsAll(p, a.CardIDs) {
			return nil, fmt.Errorf("cards are not available to recycle")
		}
		for _, id := range a.CardIDs {
			_ = consumeCard(s, p, id, true)
		}
		if err := recycle(s, gd, p); err != nil {
			return nil, err
		}
		s.Phase = domain.PhaseEnd
		checkWin(s)
		return nil, nil
	case ActPass:
		return nil, nil
	case ActPlaceMarker:
		p := s.PlayerByID(pid)
		if p == nil {
			return nil, fmt.Errorf("unknown player %q", pid)
		}
		if p.MarkersRemaining() <= 0 {
			return nil, fmt.Errorf("player %s has no control markers left", p.ID)
		}
		p.ControlMarkersPlaced++
		checkWin(s)
		return nil, nil
	case ActMoveHex:
		result, err := MoveHexWithOption(s, gd, a.PawnID, a.Dir, a.MovementIndex)
		return result, err
	case ActMoveSteps:
		result, err := MoveStepsWithOption(s, gd, a.PawnID, a.Path, a.MovementIndex)
		return result, err
	case ActDelete:
		result, err := Delete(s, gd, a.PawnID, a.TargetID, a.ExtraSkulls)
		return result, err
	case ActDeleteArea:
		result, err := DeleteArea(s, gd, a.PawnID, a.ExtraSkulls)
		return result, err
	case ActDeleteMulti:
		result, err := DeleteMulti(s, gd, a.PawnID, a.TargetIDs, a.ExtraSkulls)
		return result, err
	case ActIcebreakBlk:
		c, err := coord()
		if err != nil {
			return nil, err
		}
		result, err := IcebreakBlock(s, gd, a.PawnID, c, a.ExtraRollDice, effects)
		return result, err
	case ActIcebreakPawn:
		result, err := IcebreakPawn(s, gd, a.PawnID, a.TargetID, a.ExtraRollDice)
		return result, err
	case ActSearch:
		if gd.RegressionFixture != "provisional-v1" {
			if a.CardID != "" {
				return nil, fmt.Errorf("free Search cannot use a hand card")
			}
			return nil, BeginSearch(s, gd, pid, a.PawnID, "", effects)
		}
		result, err := Search(s, gd, a.PawnID, a.Dir, a.Rotation)
		return result, err
	case ActReboot:
		result, err := rebootAction(s, gd, a, pid)
		return result, err
	case ActPlayDelete:
		result, err := PlayDelete(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraSkulls)
		return result, err
	case ActPlayDeleteMulti:
		return PlayDeleteMulti(s, gd, pid, a.CardID, a.PawnID, a.TargetIDs, a.ExtraSkulls)
	case ActPlayDeleteArea:
		result, err := PlayDeleteArea(s, gd, pid, a.CardID, a.PawnID, a.ExtraSkulls)
		return result, err
	case ActPlayMove:
		result, err := PlayMove(s, gd, pid, a.CardID, a.PawnID, a.Path)
		return result, err
	case ActPlayIcebreakBlk:
		c, err := coord()
		if err != nil {
			return nil, err
		}
		result, err := PlayIcebreakBlock(s, gd, pid, a.CardID, a.PawnID, c, a.ExtraRollDice, effects)
		return result, err
	case ActPlayIcebreakPawn:
		result, err := PlayIcebreakPawn(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraRollDice)
		return result, err
	case ActPlaySearch:
		if gd.RegressionFixture != "provisional-v1" {
			if a.CardID == "" {
				return nil, fmt.Errorf("Search requires one action card from the controller's hand")
			}
			return nil, BeginSearch(s, gd, pid, a.PawnID, a.CardID, effects)
		}
		result, err := PlaySearch(s, gd, pid, a.CardID, a.PawnID, a.Dir, a.Rotation)
		return result, err
	case ActPlayRebootCard:
		return playRebootCardAction(s, gd, a, pid)
	case ActPlayReboot:
		result, err := playRebootAction(s, gd, a, pid)
		return result, err
	case ActAttachPawn:
		return nil, AttachToPawn(s, gd, pid, a.CardID, a.TargetID, a.SlotRef)
	case ActAttachEnemy:
		return nil, attachToEnemyWithEvents(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.SlotRef, effects)
	case ActAttachBlock:
		c, err := coord()
		if err != nil {
			return nil, err
		}
		return nil, AttachToBlock(s, gd, pid, a.CardID, a.PawnID, c)
	default:
		return nil, fmt.Errorf("unknown action %q", a.Type)
	}
}

// Apply is the compatibility reducer entry point. It deliberately does not
// preserve phase-free dispatch only for explicit historical fixtures. Source
// states delegate to ApplyWithEvents for phase and active-player authority.
func Apply(s *domain.GameState, gd *domain.GameData, a Action) error {
	if s.RulesVersion != "" || s.PendingChoice != nil || s.PendingPhase != "" || a.Type == ActResolveChoice {
		result := ApplyWithEvents(s, gd, a)
		if !result.Accepted {
			return fmt.Errorf("%s", result.Error)
		}
		return nil
	}
	backup := CloneState(s)
	_, err := applyResult(s, gd, a)
	if err != nil {
		*s = *backup
	}
	return err
}

type stateWatch struct {
	controlCardMarkers []domain.ControlCardMarker
	useMarkers         []UseMarkerAllocation
	reserve            []string
	controlCardOwners  map[string]string
	discard            []string
	hands              map[string][]string
	markers            map[string]int
	pawnOwners         map[string]string
	blockOwners        map[string]string
	bonusIcons         map[string]string
	eliminated         map[string]bool
	winnerID           string
}

func watchState(s *domain.GameState) stateWatch {
	w := stateWatch{controlCardMarkers: append([]domain.ControlCardMarker{}, s.ControlCardMarkers...), useMarkers: UseMarkerAllocations(s), reserve: append([]string{}, s.Reserve...), controlCardOwners: map[string]string{}, discard: append([]string{}, s.Discard...), hands: map[string][]string{}, markers: map[string]int{}, pawnOwners: map[string]string{}, blockOwners: map[string]string{}, bonusIcons: map[string]string{}, eliminated: map[string]bool{}, winnerID: s.WinnerID}
	for _, card := range s.ControlCards {
		w.controlCardOwners[card.CardID] = card.OwnerID
	}
	for _, p := range s.Players {
		w.hands[p.ID] = append([]string{}, p.Hand...)
		w.markers[p.ID] = p.ControlMarkersPlaced
	}
	for _, pawn := range s.Cybernet.Pawns {
		w.pawnOwners[pawn.PawnID] = pawn.OwnerID
	}
	for _, block := range s.Cybernet.Blocks {
		w.blockOwners[fmt.Sprintf("%d,%d", block.Coord.Q, block.Coord.R)] = block.OwnerID
	}
	for _, icon := range s.Cybernet.BonusIcons {
		w.bonusIcons[icon.Key] = icon.CollectedBy
	}
	for _, pawnID := range s.Eliminated {
		w.eliminated[pawnID] = true
	}
	return w
}

func addedCards(before, after []string) []string {
	counts := map[string]int{}
	for _, card := range before {
		counts[card]++
	}
	out := []string{}
	for _, card := range after {
		if counts[card] > 0 {
			counts[card]--
			continue
		}
		out = append(out, card)
	}
	return out
}

func deltaEvents(s *domain.GameState, before stateWatch) []EngineEvent {
	events := UseMarkerEvents(s, before.useMarkers)
	for _, player := range s.Players {
		for _, cardID := range addedCards(before.hands[player.ID], player.Hand) {
			events = append(events, EngineEvent{Type: EventDraw, PlayerID: player.ID, CardID: cardID})
		}
		if before.markers[player.ID] != player.ControlMarkersPlaced {
			events = append(events, EngineEvent{Type: EventControlChanged, PlayerID: player.ID, Element: "block", ElementID: "markers", ToOwnerID: fmt.Sprintf("%d", player.ControlMarkersPlaced)})
		}
	}
	for _, m := range before.controlCardMarkers {
		found := false
		for _, now := range s.ControlCardMarkers {
			if m.CardID == now.CardID && m.PlayerID == now.PlayerID {
				found = true
			}
		}
		if !found {
			events = append(events, EngineEvent{Type: "control-marker-returned", PlayerID: m.PlayerID, CardID: m.CardID, Element: "control-card", ElementID: m.CardID})
		}
	}
	for _, pawn := range s.Cybernet.Pawns {
		if old, ok := before.pawnOwners[pawn.PawnID]; !ok {
			event := EngineEvent{Type: EventPawnPlaced, Element: "pawn", ElementID: pawn.PawnID, ToOwnerID: pawn.OwnerID}
			if pawn.OwnerID == "" {
				coord := pawn.Coord
				event.Coord = &coord
				event.SpaceID = pawn.SpaceID
			}
			events = append(events, event)
		} else if old != pawn.OwnerID {
			events = append(events, EngineEvent{Type: EventControlChanged, Element: "pawn", ElementID: pawn.PawnID, FromOwnerID: old, ToOwnerID: pawn.OwnerID})
		}
	}
	for _, m := range s.ControlCardMarkers {
		found := false
		for _, old := range before.controlCardMarkers {
			if m.CardID == old.CardID && m.PlayerID == old.PlayerID {
				found = true
			}
		}
		if !found {
			events = append(events, EngineEvent{Type: "control-marker-placed", PlayerID: m.PlayerID, CardID: m.CardID, Element: "control-card", ElementID: m.CardID})
		}
	}
	for _, block := range s.Cybernet.Blocks {
		key := fmt.Sprintf("%d,%d", block.Coord.Q, block.Coord.R)
		if old, ok := before.blockOwners[key]; ok && old != block.OwnerID {
			events = append(events, EngineEvent{Type: EventControlChanged, Element: "block", ElementID: key, FromOwnerID: old, ToOwnerID: block.OwnerID})
		}
	}
	for _, icon := range s.Cybernet.BonusIcons {
		previous, existed := before.bonusIcons[icon.Key]
		if !existed {
			events = append(events, EngineEvent{Type: EventBonusIconCreated, Element: "bonus-icon", ElementID: icon.Key})
			if icon.CounterPlaced {
				events = append(events, EngineEvent{Type: EventBonusCounterPlaced, Element: "bonus-icon", ElementID: icon.Key, Amount: 1})
			}
		}
		if previous == "" && icon.CollectedBy != "" {
			events = append(events, EngineEvent{Type: EventBonusCollected, PlayerID: icon.CollectedBy, Element: "bonus-icon", ElementID: icon.Key})
		}
	}
	for _, pawnID := range s.Eliminated {
		if !before.eliminated[pawnID] {
			events = append(events, EngineEvent{Type: EventElimination, PawnID: pawnID})
		}
	}
	for _, pawnID := range s.Reserve {
		if !containsString(before.reserve, pawnID) {
			if _, ok := before.pawnOwners[pawnID]; ok && s.Cybernet.PawnByID(pawnID) == nil {
				events = append(events, EngineEvent{Type: EventElimination, PawnID: pawnID}, EngineEvent{Type: "pawn-returned-to-reserve", PawnID: pawnID})
			}
		}
	}
	for _, cardID := range addedCards(before.discard, s.Discard) {
		events = append(events, EngineEvent{Type: "card-discarded", CardID: cardID})
	}

	for _, card := range s.ControlCards {
		if owner := before.controlCardOwners[card.CardID]; owner != "" && card.OwnerID == "" {
			e := EngineEvent{Type: "control-card-released", PlayerID: owner, CardID: card.CardID}
			if card.Subject.Kind == "pawn" {
				e.PawnID = card.Subject.ID
			}
			events = append(events, e)
		}
	}
	if before.winnerID == "" && s.WinnerID != "" {
		events = append(events, EngineEvent{Type: EventWinnerDeclared, PlayerID: s.WinnerID})
	}
	return events
}

// appendUnreportedDeltas preserves operation order without duplicating semantic records.
func appendUnreportedDeltas(events, deltas []EngineEvent) []EngineEvent {
	reported := append([]EngineEvent{}, events...)
	for _, delta := range deltas {
		found := -1
		for i, event := range reported {
			if delta.Type == EventDraw && event.Type == "card-stolen" && event.PlayerID == delta.PlayerID && event.CardID == delta.CardID || event.Type == delta.Type && (event.PlayerID == delta.PlayerID || delta.Type == "card-discarded" && delta.PlayerID == "") && event.CardID == delta.CardID && event.PawnID == delta.PawnID && event.ElementID == delta.ElementID {
				found = i
				break
			}
		}
		if found >= 0 {
			reported = append(reported[:found], reported[found+1:]...)
		} else {
			events = append(events, delta)
		}
	}
	return events
}

func rollFrom(result any) []int {
	switch value := result.(type) {
	case MovementRollResult:
		return value.Roll
	case PublicAttackResult:
		return value.Roll
	case DeleteResult:
		return value.Roll
	case DeleteAreaResult:
		return value.Roll
	case DeleteMultiResult:
		return value.Roll
	case IcebreakResult:
		return value.Roll
	default:
		return nil
	}
}

// CloneState copies board, hands, counters and the exact RNG stream for previews.
func CloneState(s *domain.GameState) *domain.GameState {
	encoded, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	var copy domain.GameState
	if err := json.Unmarshal(encoded, &copy); err != nil {
		panic(err)
	}
	rng := *s.RNG
	copy.RNG = &rng
	for _, p := range copy.Players {
		if p.OncePerTurnUsed == nil {
			p.OncePerTurnUsed = map[string]bool{}
		}
	}
	return &copy
}

func validateLiveAction(s *domain.GameState, gd *domain.GameData, a Action) (string, error) {
	if s.PendingAttack != nil && a.Type != ActAssignDelete {
		return "", fmt.Errorf("assign the attack dice first")
	}
	if s.PendingThreats != nil && a.Type != ActRollDelete && a.Type != ActAssignDelete && a.Type != ActAssignThreatAttack {
		return "", fmt.Errorf("resolve the threat combat first")
	}
	if s.WinnerID != "" {
		return "", fmt.Errorf("the match has finished")
	}
	if a.Type == ActPlaceMarker {
		return "", fmt.Errorf("control markers are placed by Icebreaker, not as a free action")
	}
	if a.ExtraSkulls != 0 || a.ExtraRollDice != 0 {
		return "", fmt.Errorf("combat modifiers must come from game effects")
	}
	p := s.CurrentPlayerPtr()
	if a.PlayerID != "" {
		p = s.PlayerByID(a.PlayerID)
	}
	if p == nil {
		return "", fmt.Errorf("unknown acting player")
	}
	if a.Type == ActDelete || a.Type == ActDeleteMulti || a.Type == ActDeleteArea || a.Type == ActPlayDelete || a.Type == ActPlayDeleteMulti || a.Type == ActPlayDeleteArea {
		actor := s.Cybernet.PawnByID(a.PawnID)
		if actor != nil {
			for _, t := range threatsAt(s, actor.Coord) {
				if t.Status != "eliminated" {
					return "", fmt.Errorf("use a public Delete roll to resolve threat combat")
				}
			}
		}
	}
	if a.Type == ActPlayMove || a.Type == ActMoveSteps {
		placed := s.Cybernet.PawnByID(a.PawnID)
		def, _ := gd.PawnByID(a.PawnID)
		stealth := false
		if a.Type != ActPlayMove && placed != nil && def != nil {
			option, err := MovementOptionAt(gd, def, placed.Attachments, a.MovementIndex)
			if err == nil {
				stealth = option.Stealth
			}
		}
		if !stealth && def != nil && def.Special != "does-not-activate-threats" {
			for i, step := range a.Path {
				if i == len(a.Path)-1 {
					break
				}
				for _, t := range threatsAt(s, step.Coord) {
					if t.Status != "eliminated" {
						return "", fmt.Errorf("movement must stop at the first threatening block")
					}
				}
			}
		}
	}
	if a.PawnID != "" && a.Type != ActReboot && a.Type != ActPlayReboot && a.Type != ActPlayRebootCard {
		pawn := s.Cybernet.PawnByID(a.PawnID)
		if pawn == nil || pawn.OwnerID != p.ID {
			return "", fmt.Errorf("only the active player's pawns may act")
		}
	}
	abilities := map[ActionType]string{ActSearch: "search", ActDelete: "delete", ActDeleteArea: "delete", ActDeleteMulti: "delete", ActIcebreakBlk: "icebreaker", ActIcebreakPawn: "icebreaker", ActReboot: "reboot"}
	if name := abilities[a.Type]; name != "" {
		pawn, ok := gd.PawnByID(a.PawnID)
		var atts []domain.Attachment
		if placed := s.Cybernet.PawnByID(a.PawnID); placed != nil {
			atts = placed.Attachments
		}
		if !ok {
			return "", fmt.Errorf("this ability requires a card activation")
		}
		ability := effectiveAbility(gd, pawn, atts, name)
		if name == "delete" && gd.RegressionFixture != "provisional-v1" {
			if _, err := requireDeleteActivation(gd, pawn, atts, "once-per-turn"); err != nil {
				return "", err
			}
		} else if ability == nil || ability.Activation != "once-per-turn" {
			return "", fmt.Errorf("this ability requires a card activation")
		}
	}
	if a.Type == ActMoveHex || a.Type == ActMoveSteps {
		pawn, ok := gd.PawnByID(a.PawnID)
		placed := s.Cybernet.PawnByID(a.PawnID)
		if !ok || placed == nil {
			return "", fmt.Errorf("unknown moving pawn")
		}
		option, err := MovementOptionAt(gd, pawn, placed.Attachments, a.MovementIndex)
		if err != nil {
			return "", err
		}
		if option.Movement.Activation == "card" {
			card := cardByID(gd, a.CardID)
			if !cardInHand(p, a.CardID) || card == nil || card.Movement <= 0 {
				return "", fmt.Errorf("this movement requires a movement card in hand")
			}
			return a.CardID, nil
		}
		if gd.RegressionFixture != "provisional-v1" && a.CardID != "" {
			return "", fmt.Errorf("free movement cannot also spend an action card")
		}
	}
	return "", nil
}

// ApplyWithEvents enforces live action authority and rolls back rejected actions.
func ApplyWithEvents(s *domain.GameState, gd *domain.GameData, a Action) TransitionResult {
	if s.PlayedCardOwners != nil {
		valid := len(s.PlayedCardOwners) == len(s.PlayedCards)
		for _, id := range s.PlayedCardOwners {
			valid = valid && s.PlayerByID(id) != nil
		}
		if !valid {
			return TransitionResult{Phase: s.Phase, Error: "played card ownership does not match physical cards", Events: []EngineEvent{}}
		}
	}
	if _, err := BonusCounterPool(s); err != nil {
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{}}
	}
	if a.AttachmentID != "" && (a.Type != ActResolveChoice || s.PendingChoice == nil || s.PendingChoice.Kind != "space-discard") {
		return TransitionResult{Phase: s.Phase, Error: "attachmentId is only valid for a pending space discard", Events: []EngineEvent{}}
	}
	if a.SlotRef != "" && a.Type != ActAttachPawn && a.Type != ActAttachEnemy {
		return TransitionResult{Accepted: false, Phase: s.Phase, Error: "slotRef is only valid for pawn attachment actions", Events: []EngineEvent{}}
	}
	if s.PendingChoice != nil || a.Type == ActResolveChoice {
		return applyPendingChoice(s, gd, a)
	}
	playerID := a.PlayerID
	if playerID == "" {
		playerID = s.CurrentPlayerPtr().ID
	}
	permission, assignment := PermittedAbilityTurn(s, gd, a), permittedAttackAssignment(s, a)
	phaseCombat := s.PendingPhase != "" && (s.PendingAttack != nil || s.PendingThreats != nil) && (a.Type == ActRollDelete || a.Type == ActAssignDelete || a.Type == ActAssignThreatAttack)
	if !permission && !assignment && !phaseCombat && ((a.Type == ActRecycle && s.Phase != domain.PhaseRecycle) || (a.Type != ActRecycle && s.Phase != domain.PhaseAction)) {
		message := fmt.Sprintf("actions are only accepted during the action phase (current: %s)", s.Phase)
		return TransitionResult{Phase: s.Phase, Error: message, Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: message}}}
	}
	if (s.PendingAttack != nil && !assignment) || (playerID != s.CurrentPlayerPtr().ID && !permission && !assignment) {
		message := "only the active player may act"
		return TransitionResult{Phase: s.Phase, Error: message, Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: message}}}
	}
	before := watchState(s)
	backup := CloneState(s)
	movementCard, err := validateLiveAction(s, gd, a)
	if err != nil {
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: err.Error()}}}
	}
	effects := []EngineEvent{}
	result, err := applyResult(s, gd, a, &effects)
	if err != nil {
		*s = *backup
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: err.Error()}}}
	}
	if movementCard != "" {
		consumeCard(s, s.CurrentPlayerPtr(), movementCard)
	}
	if (a.Type == ActPlayMove || a.Type == ActMoveSteps || a.Type == ActMoveHex) && (gd.RegressionFixture == "provisional-v1" || a.Type == ActMoveHex || len(a.Path) > 0) {
		placed := s.Cybernet.PawnByID(a.PawnID)
		def, _ := gd.PawnByID(a.PawnID)
		stealth := false
		if a.Type != ActPlayMove && placed != nil && def != nil {
			option, err := MovementOptionAt(gd, def, placed.Attachments, a.MovementIndex)
			if err == nil {
				stealth = option.Stealth
			}
		}
		AwakenThreats(s, gd, a.PawnID, stealth)
		if err := OfferSpaceEffect(s, gd, a.PawnID); err != nil {
			*s = *backup
			return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: err.Error()}}}
		}
	}
	if gd.RegressionFixture == "provisional-v1" && (a.Type == ActSearch || a.Type == ActPlaySearch) {
		for _, b := range s.Cybernet.Blocks {
			if err := DeployThreats(s, gd, b.Coord); err != nil {
				*s = *backup
				return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{}}
			}
		}
	}
	if err := ResumePhaseEffects(s, gd, &effects); err != nil {
		*s = *backup
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: err.Error()}}}
	}
	events := []EngineEvent{{Type: EventActionAccepted, PlayerID: playerID, ActionType: a.Type}}
	for _, event := range UseMarkerEvents(s, before.useMarkers) {
		if event.Type == "ability-use-marked" {
			events = append(events, event)
		}
	}
	if roll := rollFrom(result); len(roll) > 0 {
		events = append(events, EngineEvent{Type: EventRoll, PlayerID: playerID, ActionType: a.Type, Roll: roll})
	}
	events = append(events, effects...)
	events = appendUnreportedDeltas(events, deltaEvents(s, before))
	if s.Phase != backup.Phase {
		events = append(events, EngineEvent{Type: EventPhaseAdvanced, PlayerID: playerID, FromPhase: backup.Phase, ToPhase: s.Phase})
	}
	if s.PendingChoice != nil {
		events = append(events, EngineEvent{Type: EventChoiceRequired, PlayerID: s.PendingChoice.PlayerID, ElementID: s.PendingChoice.ID, CardID: s.PendingChoice.CardID})
	}
	return TransitionResult{Accepted: true, Phase: s.Phase, Events: events}
}

// AdvancePhase advances exactly one live turn phase and runs mandatory phase work.
func AdvancePhase(s *domain.GameState, gd *domain.GameData) TransitionResult {
	if _, err := BonusCounterPool(s); err != nil {
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{}}
	}
	if s.WinnerID != "" {
		return TransitionResult{Phase: s.Phase, Error: "the match has finished", Events: []EngineEvent{{Type: "validation-failed", Message: "the match has finished"}}}
	}
	if s.PendingAttack != nil || s.PendingThreats != nil {
		return TransitionResult{Phase: s.Phase, Error: "resolve combat before ending the phase", Events: []EngineEvent{}}
	}
	if s.PendingChoice != nil {
		return TransitionResult{Phase: s.Phase, Error: "resolve the pending decision first", Events: []EngineEvent{}}
	}
	backup := CloneState(s)
	before, from := watchState(s), s.Phase
	var err error
	effects := []EngineEvent{}
	switch s.Phase {
	case domain.PhaseBeginning:
		err = StartPhaseEffects(s, gd, "beginning", &effects)
	case domain.PhaseAction:
		err = StartPhaseEffects(s, gd, "action", &effects)
	case domain.PhaseRecycle:
		err = recycle(s, gd, s.CurrentPlayerPtr())
		if err == nil {
			s.Phase = domain.PhaseEnd
			checkWin(s)
		}
	case domain.PhaseEnd:
		s.CurrentPlayer = (s.CurrentPlayer + 1) % len(s.Players)
		s.Turn++
		s.Phase = domain.PhaseBeginning
	}
	if err != nil {
		*s = *backup
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: "validation-failed", Message: err.Error()}}}
	}
	events := append([]EngineEvent{}, effects...)
	if s.RulesVersion != "" {
		events = appendUnreportedDeltas(events, deltaEvents(s, before))
	}
	if s.Phase != from {
		events = append(events, EngineEvent{Type: EventPhaseAdvanced, PlayerID: s.CurrentPlayerPtr().ID, FromPhase: from, ToPhase: s.Phase})
	}
	if s.RulesVersion == "" {
		events = appendUnreportedDeltas(events, deltaEvents(s, before))
	}
	if s.PendingChoice != nil {
		events = append(events, EngineEvent{Type: EventChoiceRequired, PlayerID: s.PendingChoice.PlayerID, ElementID: s.PendingChoice.ID, CardID: s.PendingChoice.CardID})
	}
	return TransitionResult{Accepted: true, Phase: s.Phase, Events: events}
}

// RunTurn executes the four phases of the current player's turn, applying the
// given action-phase actions in order, then advances to the next player.
func RunTurn(s *domain.GameState, gd *domain.GameData, actions []Action) error {
	// Preserve the old convenience API while delegating to the live phase API.
	if s.PendingChoice != nil {
		return fmt.Errorf("resolve the pending decision first")
	}
	s.Phase = domain.PhaseBeginning
	if result := AdvancePhase(s, gd); !result.Accepted {
		return fmt.Errorf("%s", result.Error)
	}
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil {
		return nil
	}
	for _, a := range actions {
		if s.WinnerID != "" {
			break
		}
		if err := Apply(s, gd, a); err != nil {
			return err
		}
	}

	if s.WinnerID != "" {
		return nil
	}
	if result := AdvancePhase(s, gd); !result.Accepted {
		return fmt.Errorf("%s", result.Error)
	}
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil {
		return nil
	}
	if result := AdvancePhase(s, gd); !result.Accepted {
		return fmt.Errorf("%s", result.Error)
	}
	if s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil {
		return nil
	}
	AdvancePhase(s, gd)
	return nil
}

// recycle brings a player's hand to exactly MaxHandSize (draw up / discard down).
func recycle(s *domain.GameState, gd *domain.GameData, p *domain.Player) error {
	if s.RulesVersion != "" && s.PlayedCardOwners != nil {
		if len(s.PlayedCardOwners) != len(s.PlayedCards) {
			return fmt.Errorf("played card ownership does not match physical cards")
		}
		kept, owners := []string{}, []string{}
		for i, id := range s.PlayedCards {
			if s.PlayedCardOwners[i] == p.ID {
				s.Discard = append(s.Discard, id)
			} else {
				kept = append(kept, id)
				owners = append(owners, s.PlayedCardOwners[i])
			}
		}
		s.PlayedCards = kept
		s.PlayedCardOwners = owners
		if len(kept) == 0 {
			s.PlayedCardOwners = nil
		}
	} else {
		s.Discard = append(s.Discard, s.PlayedCards...)
		s.PlayedCards = []string{}
	}
	drawModifier, _ := PlayerAttachmentModifiers(s, gd, p.ID)
	profile, err := HandSizeProfileFor(s, gd, p.ID)
	if err != nil {
		return err
	}
	maxHandSize := profile.Maximum
	draws := maxHandSize - len(p.Hand) + drawModifier
	if draws < 0 {
		draws = 0
	}
	for i := 0; i < draws; i++ {
		card, ok := draw(s)
		if !ok {
			break
		}
		p.Hand = append(p.Hand, card)
	}
	for len(p.Hand) > maxHandSize {
		last := len(p.Hand) - 1
		s.Discard = append(s.Discard, p.Hand[last])
		p.Hand = p.Hand[:last]
	}
	return nil
}

// checkWin sets WinnerID for the first player who has placed all markers.
func checkWin(s *domain.GameState) {
	if s.WinnerID != "" {
		return
	}
	for _, p := range s.Players {
		if p.ControlMarkersPlaced >= p.ControlMarkersTotal {
			s.WinnerID = p.ID
			return
		}
	}
}

// Winner returns the winning player's id, or "" if the game is ongoing.
func Winner(s *domain.GameState) string {
	return s.WinnerID
}

func rebootTarget(a Action) ([]SpaceRef, error) {
	if a.Coord == nil && a.SpaceID == "" {
		return nil, nil
	}
	if a.Coord == nil || a.SpaceID == "" {
		return nil, fmt.Errorf("select a complete Reboot destination")
	}
	return []SpaceRef{{Coord: *a.Coord, SpaceID: a.SpaceID}}, nil
}
func rebootAction(s *domain.GameState, gd *domain.GameData, a Action, pid string) (*domain.PawnOnBoard, error) {
	d, err := rebootTarget(a)
	if err != nil {
		return nil, err
	}
	return Reboot(s, gd, a.PawnID, pid, d...)
}
func playRebootCardAction(s *domain.GameState, gd *domain.GameData, a Action, pid string) (*domain.PawnOnBoard, error) {
	d, err := rebootTarget(a)
	if err != nil {
		return nil, err
	}
	return PlayRebootCard(s, gd, pid, a.CardID, a.PawnID, d...)
}
func playRebootAction(s *domain.GameState, gd *domain.GameData, a Action, pid string) (*domain.PawnOnBoard, error) {
	d, err := rebootTarget(a)
	if err != nil {
		return nil, err
	}
	return PlayReboot(s, gd, pid, a.CardIDs, a.PawnID, d...)
}
