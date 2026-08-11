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
	ActDelete       ActionType = "delete"
	ActDeleteMulti  ActionType = "delete-multi"
	ActIcebreakBlk  ActionType = "icebreak-block"
	ActIcebreakPawn ActionType = "icebreak-pawn"
	ActSearch       ActionType = "search"
	ActReboot       ActionType = "reboot"
	// Card-driven variants (consume cards from hand).
	ActPlayDelete       ActionType = "play-delete"
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
	PawnID        string        `json:"pawnId,omitempty"`  // acting pawn (attacker/actor/searcher/rebooted)
	TargetID      string        `json:"targetId,omitempty"`
	TargetIDs     []string      `json:"targetIds,omitempty"`
	Coord         *domain.Coord `json:"coord,omitempty"`
	Dir           int           `json:"dir,omitempty"`
	Rotation      int           `json:"rotation,omitempty"`
	ExtraSkulls   int           `json:"extraSkulls,omitempty"`
	ExtraRollDice int           `json:"extraRollDice,omitempty"`
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
func Apply(s *domain.GameState, gd *domain.GameData, a Action) error {
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
		return nil
	case ActPlaceMarker:
		p := s.PlayerByID(pid)
		if p == nil {
			return fmt.Errorf("unknown player %q", pid)
		}
		if p.MarkersRemaining() <= 0 {
			return fmt.Errorf("player %s has no control markers left", p.ID)
		}
		p.ControlMarkersPlaced++
		checkWin(s)
		return nil
	case ActMoveHex:
		_, err := MoveHex(s, gd, a.PawnID, a.Dir)
		return err
	case ActDelete:
		_, err := Delete(s, gd, a.PawnID, a.TargetID, a.ExtraSkulls)
		return err
	case ActDeleteMulti:
		_, err := DeleteMulti(s, gd, a.PawnID, a.TargetIDs, a.ExtraSkulls)
		return err
	case ActIcebreakBlk:
		c, err := coord()
		if err != nil {
			return err
		}
		_, err = IcebreakBlock(s, gd, a.PawnID, c, a.ExtraRollDice)
		return err
	case ActIcebreakPawn:
		_, err := IcebreakPawn(s, gd, a.PawnID, a.TargetID, a.ExtraRollDice)
		return err
	case ActSearch:
		_, err := Search(s, gd, a.PawnID, a.Dir, a.Rotation)
		return err
	case ActReboot:
		_, err := Reboot(s, gd, a.PawnID, pid)
		return err
	case ActPlayDelete:
		_, err := PlayDelete(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraSkulls)
		return err
	case ActPlayIcebreakBlk:
		c, err := coord()
		if err != nil {
			return err
		}
		_, err = PlayIcebreakBlock(s, gd, pid, a.CardID, a.PawnID, c, a.ExtraRollDice)
		return err
	case ActPlayIcebreakPawn:
		_, err := PlayIcebreakPawn(s, gd, pid, a.CardID, a.PawnID, a.TargetID, a.ExtraRollDice)
		return err
	case ActPlaySearch:
		_, err := PlaySearch(s, gd, pid, a.CardID, a.PawnID, a.Dir, a.Rotation)
		return err
	case ActPlayReboot:
		_, err := PlayReboot(s, gd, pid, a.CardIDs, a.PawnID)
		return err
	case ActAttachPawn:
		return AttachToPawn(s, gd, pid, a.CardID, a.TargetID)
	case ActAttachEnemy:
		return AttachToEnemy(s, gd, pid, a.CardID, a.PawnID, a.TargetID)
	case ActAttachBlock:
		c, err := coord()
		if err != nil {
			return err
		}
		return AttachToBlock(s, gd, pid, a.CardID, a.PawnID, c)
	default:
		return fmt.Errorf("unknown action %q", a.Type)
	}
}

// RunTurn executes the four phases of the current player's turn, applying the
// given action-phase actions in order, then advances to the next player.
func RunTurn(s *domain.GameState, gd *domain.GameData, actions []Action) error {
	// 1. Beginning: clear once-per-turn markers; (begin-of-turn effects: planned).
	s.Phase = domain.PhaseBeginning
	s.CurrentPlayerPtr().OncePerTurnUsed = map[string]bool{}

	// 2. Action.
	s.Phase = domain.PhaseAction
	for _, a := range actions {
		if s.WinnerID != "" {
			break
		}
		if err := Apply(s, gd, a); err != nil {
			return err
		}
	}

	// 3. Recycle: refill/trim hand to max hand size.
	s.Phase = domain.PhaseRecycle
	recycle(s, s.CurrentPlayerPtr())

	// 4. End: check win, advance.
	s.Phase = domain.PhaseEnd
	checkWin(s)
	if s.WinnerID == "" {
		s.CurrentPlayer = (s.CurrentPlayer + 1) % len(s.Players)
		s.Turn++
		s.Phase = domain.PhaseBeginning
	}
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
