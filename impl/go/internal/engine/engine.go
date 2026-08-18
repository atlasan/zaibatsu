// Package engine is the Zaibatsu rules engine: setup and the turn-phase state
// machine. It is a pure reducer (state × action → state) with no I/O. It mirrors
// impl/ts/src/engine. See DOCS/turn-flow.md and DOCS/parity.md.
package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Config describes a new game to set up.
type Config struct {
	Data        *domain.GameData
	PlayerNames []string
	Seed        uint64
}

// ActionType enumerates the player actions the engine understands. Each maps to
// a resolver; Apply dispatches on it. See DOCS/architecture.md ("State & actions").
type ActionType string

const (
	ActPass         ActionType = "pass"
	ActPlaceMarker  ActionType = "place-marker" // direct marker placement (utility)
	ActMoveHex      ActionType = "move-hex"
	ActMoveSteps    ActionType = "move-steps"
	ActDelete       ActionType = "delete"
	ActDeleteMulti  ActionType = "delete-multi"
	ActIcebreakBlk  ActionType = "icebreak-block"
	ActIcebreakPawn ActionType = "icebreak-pawn"
	ActSearch       ActionType = "search"
	ActReboot       ActionType = "reboot"
	// Card-driven variants (consume cards from hand).
	ActPlayDelete       ActionType = "play-delete"
	ActPlayMove         ActionType = "play-move"
	ActPlayIcebreakBlk  ActionType = "play-icebreak-block"
	ActPlayIcebreakPawn ActionType = "play-icebreak-pawn"
	ActPlaySearch       ActionType = "play-search"
	ActPlayReboot       ActionType = "play-reboot"
	ActAttachPawn       ActionType = "attach-pawn"
	ActAttachEnemy      ActionType = "attach-enemy"
	ActAttachBlock      ActionType = "attach-block"
)

// Action is a single player intent — a tagged union whose Type selects which
// fields are read. PlayerID defaults to the current player when empty. It mirrors
// impl/ts Action. Not every field applies to every Type.
type Action struct {
	Type          ActionType    `json:"type"`
	PlayerID      string        `json:"playerId,omitempty"`
	CardID        string        `json:"cardId,omitempty"`
	CardIDs       []string      `json:"cardIds,omitempty"`
	PawnID        string        `json:"pawnId,omitempty"` // acting pawn (attacker/actor/searcher/rebooted)
	Path          []SpaceRef    `json:"path,omitempty"`   // declared space-to-space movement path
	TargetID      string        `json:"targetId,omitempty"`
	TargetIDs     []string      `json:"targetIds,omitempty"`
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
	EventPhaseAdvanced  EventType = "phase-advanced"
	EventActionAccepted EventType = "action-accepted"
	EventRoll           EventType = "roll"
	EventDraw           EventType = "draw"
	EventElimination    EventType = "elimination"
	EventControlChanged EventType = "control-changed"
	EventValidationFail EventType = "validation-failed"
	EventWinnerDeclared EventType = "winner-declared"
)

// EngineEvent is structured output from phase transitions and accepted actions.
// It contains no display text and is safe for a local client to render directly.
type EngineEvent struct {
	Type        EventType    `json:"type"`
	PlayerID    string       `json:"playerId,omitempty"`
	ActionType  ActionType   `json:"actionType,omitempty"`
	FromPhase   domain.Phase `json:"fromPhase,omitempty"`
	ToPhase     domain.Phase `json:"toPhase,omitempty"`
	Roll        []int        `json:"roll,omitempty"`
	PawnID      string       `json:"pawnId,omitempty"`
	Element     string       `json:"element,omitempty"`
	ElementID   string       `json:"elementId,omitempty"`
	FromOwnerID string       `json:"fromOwnerId,omitempty"`
	ToOwnerID   string       `json:"toOwnerId,omitempty"`
	CardID      string       `json:"cardId,omitempty"`
	Message     string       `json:"message,omitempty"`
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
	if n < mode.Players.Min || n > mode.Players.Max {
		return nil, fmt.Errorf("mode %q supports %d-%d players, got %d", mode.ID, mode.Players.Min, mode.Players.Max, n)
	}

	rng := domain.NewRNG(cfg.Seed)

	// Assign starter pawns at random.
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
		players[i] = &domain.Player{
			ID:                  fmt.Sprintf("p%d", i+1),
			Name:                name,
			Color:               colors[i%len(colors)],
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
		BlockPile:     blockPile,
		Cybernet:      cybernet,
		Eliminated:    []string{},
		RNG:           rng,
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
// the engine's single reducer entry point (state × action → state).
func applyResult(s *domain.GameState, gd *domain.GameData, a Action) (any, error) {
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
		result, err := MoveHex(s, gd, a.PawnID, a.Dir)
		return result, err
	case ActMoveSteps:
		result, err := MoveSteps(s, gd, a.PawnID, a.Path)
		return result, err
	case ActDelete:
		result, err := Delete(s, gd, a.PawnID, a.TargetID, a.ExtraSkulls)
		return result, err
	case ActDeleteMulti:
		result, err := DeleteMulti(s, gd, a.PawnID, a.TargetIDs, a.ExtraSkulls)
		return result, err
	case ActIcebreakBlk:
		c, err := coord()
		if err != nil {
			return nil, err
		}
		result, err := IcebreakBlock(s, gd, a.PawnID, c, a.ExtraRollDice)
		return result, err
	case ActIcebreakPawn:
		result, err := IcebreakPawn(s, gd, a.PawnID, a.TargetID, a.ExtraRollDice)
		return result, err
	case ActSearch:
		result, err := Search(s, gd, a.PawnID, a.Dir, a.Rotation)
		return result, err
	case ActReboot:
		result, err := Reboot(s, gd, a.PawnID, pid)
		return result, err
	case ActPlayDelete:
		result, err := PlayDelete(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraSkulls)
		return result, err
	case ActPlayMove:
		result, err := PlayMove(s, gd, pid, a.CardID, a.PawnID, a.Path)
		return result, err
	case ActPlayIcebreakBlk:
		c, err := coord()
		if err != nil {
			return nil, err
		}
		result, err := PlayIcebreakBlock(s, gd, pid, a.CardID, a.PawnID, c, a.ExtraRollDice)
		return result, err
	case ActPlayIcebreakPawn:
		result, err := PlayIcebreakPawn(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraRollDice)
		return result, err
	case ActPlaySearch:
		result, err := PlaySearch(s, gd, pid, a.CardID, a.PawnID, a.Dir, a.Rotation)
		return result, err
	case ActPlayReboot:
		result, err := PlayReboot(s, gd, pid, a.CardIDs, a.PawnID)
		return result, err
	case ActAttachPawn:
		return nil, AttachToPawn(s, gd, pid, a.CardID, a.TargetID)
	case ActAttachEnemy:
		return nil, AttachToEnemy(s, gd, pid, a.CardID, a.PawnID, a.TargetID)
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
// impose a phase; callers using live turns should use ApplyWithEvents instead.
func Apply(s *domain.GameState, gd *domain.GameData, a Action) error {
	_, err := applyResult(s, gd, a)
	return err
}

type stateWatch struct {
	hands       map[string][]string
	markers     map[string]int
	pawnOwners  map[string]string
	blockOwners map[string]string
	eliminated  map[string]bool
	winnerID    string
}

func watchState(s *domain.GameState) stateWatch {
	w := stateWatch{hands: map[string][]string{}, markers: map[string]int{}, pawnOwners: map[string]string{}, blockOwners: map[string]string{}, eliminated: map[string]bool{}, winnerID: s.WinnerID}
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
	events := []EngineEvent{}
	for _, player := range s.Players {
		for _, cardID := range addedCards(before.hands[player.ID], player.Hand) {
			events = append(events, EngineEvent{Type: EventDraw, PlayerID: player.ID, CardID: cardID})
		}
		if before.markers[player.ID] != player.ControlMarkersPlaced {
			events = append(events, EngineEvent{Type: EventControlChanged, PlayerID: player.ID, Element: "block", ElementID: "markers", ToOwnerID: fmt.Sprintf("%d", player.ControlMarkersPlaced)})
		}
	}
	for _, pawn := range s.Cybernet.Pawns {
		if old, ok := before.pawnOwners[pawn.PawnID]; ok && old != pawn.OwnerID {
			events = append(events, EngineEvent{Type: EventControlChanged, Element: "pawn", ElementID: pawn.PawnID, FromOwnerID: old, ToOwnerID: pawn.OwnerID})
		}
	}
	for _, block := range s.Cybernet.Blocks {
		key := fmt.Sprintf("%d,%d", block.Coord.Q, block.Coord.R)
		if old, ok := before.blockOwners[key]; ok && old != block.OwnerID {
			events = append(events, EngineEvent{Type: EventControlChanged, Element: "block", ElementID: key, FromOwnerID: old, ToOwnerID: block.OwnerID})
		}
	}
	for _, pawnID := range s.Eliminated {
		if !before.eliminated[pawnID] {
			events = append(events, EngineEvent{Type: EventElimination, PawnID: pawnID})
		}
	}
	if before.winnerID == "" && s.WinnerID != "" {
		events = append(events, EngineEvent{Type: EventWinnerDeclared, PlayerID: s.WinnerID})
	}
	return events
}

func rollFrom(result any) []int {
	switch value := result.(type) {
	case DeleteResult:
		return value.Roll
	case DeleteMultiResult:
		return value.Roll
	case IcebreakResult:
		return value.Roll
	default:
		return nil
	}
}

// ApplyWithEvents applies an action only during the action phase and returns
// structured, client-safe output instead of display text.
func ApplyWithEvents(s *domain.GameState, gd *domain.GameData, a Action) TransitionResult {
	playerID := a.PlayerID
	if playerID == "" {
		playerID = s.CurrentPlayerPtr().ID
	}
	if s.Phase != domain.PhaseAction {
		message := fmt.Sprintf("actions are only accepted during the action phase (current: %s)", s.Phase)
		return TransitionResult{Phase: s.Phase, Error: message, Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: message}}}
	}
	if playerID != s.CurrentPlayerPtr().ID {
		message := "only the active player may act"
		return TransitionResult{Phase: s.Phase, Error: message, Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: message}}}
	}
	before := watchState(s)
	result, err := applyResult(s, gd, a)
	if err != nil {
		return TransitionResult{Phase: s.Phase, Error: err.Error(), Events: []EngineEvent{{Type: EventValidationFail, PlayerID: playerID, ActionType: a.Type, Message: err.Error()}}}
	}
	events := []EngineEvent{{Type: EventActionAccepted, PlayerID: playerID, ActionType: a.Type}}
	if roll := rollFrom(result); len(roll) > 0 {
		events = append(events, EngineEvent{Type: EventRoll, PlayerID: playerID, ActionType: a.Type, Roll: roll})
	}
	events = append(events, deltaEvents(s, before)...)
	return TransitionResult{Accepted: true, Phase: s.Phase, Events: events}
}

// AdvancePhase advances exactly one live turn phase and runs mandatory phase work.
func AdvancePhase(s *domain.GameState, _ *domain.GameData) TransitionResult {
	before, from := watchState(s), s.Phase
	switch s.Phase {
	case domain.PhaseBeginning:
		s.CurrentPlayerPtr().OncePerTurnUsed = map[string]bool{}
		s.Phase = domain.PhaseAction
	case domain.PhaseAction:
		s.Phase = domain.PhaseRecycle
		recycle(s, s.CurrentPlayerPtr())
	case domain.PhaseRecycle:
		s.Phase = domain.PhaseEnd
		checkWin(s)
	case domain.PhaseEnd:
		if s.WinnerID == "" {
			s.CurrentPlayer = (s.CurrentPlayer + 1) % len(s.Players)
			s.Turn++
			s.Phase = domain.PhaseBeginning
		}
	}
	events := []EngineEvent{{Type: EventPhaseAdvanced, PlayerID: s.CurrentPlayerPtr().ID, FromPhase: from, ToPhase: s.Phase}}
	events = append(events, deltaEvents(s, before)...)
	return TransitionResult{Accepted: true, Phase: s.Phase, Events: events}
}

// RunTurn executes the four phases of the current player's turn, applying the
// given action-phase actions in order, then advances to the next player.
func RunTurn(s *domain.GameState, gd *domain.GameData, actions []Action) error {
	// Preserve the old convenience API while delegating to the live phase API.
	s.Phase = domain.PhaseBeginning
	AdvancePhase(s, gd)
	for _, a := range actions {
		if s.WinnerID != "" {
			break
		}
		if err := Apply(s, gd, a); err != nil {
			return err
		}
	}

	AdvancePhase(s, gd)
	AdvancePhase(s, gd)
	AdvancePhase(s, gd)
	return nil
}

// recycle brings a player's hand to exactly MaxHandSize (draw up / discard down).
func recycle(s *domain.GameState, p *domain.Player) {
	for len(p.Hand) < p.MaxHandSize {
		card, ok := draw(s)
		if !ok {
			break
		}
		p.Hand = append(p.Hand, card)
	}
	for len(p.Hand) > p.MaxHandSize {
		last := len(p.Hand) - 1
		s.Discard = append(s.Discard, p.Hand[last])
		p.Hand = p.Hand[:last]
	}
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
