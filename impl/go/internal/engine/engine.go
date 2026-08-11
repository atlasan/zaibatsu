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

// ActionType enumerates the player actions the slice engine understands.
type ActionType string

const (
	ActPass        ActionType = "pass"
	ActPlaceMarker ActionType = "place-marker"
)

// Action is a single player intent submitted during the action phase.
type Action struct {
	Type ActionType
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

	state := &domain.GameState{
		Players:       players,
		CurrentPlayer: 0,
		Turn:          1,
		Phase:         domain.PhaseBeginning,
		Deck:          deck,
		Discard:       []string{},
		BlockPile:     blockPile,
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

// Apply validates and applies a single action during the action phase.
func Apply(s *domain.GameState, a Action) error {
	p := s.CurrentPlayerPtr()
	switch a.Type {
	case ActPass:
		return nil
	case ActPlaceMarker:
		if p.MarkersRemaining() <= 0 {
			return fmt.Errorf("player %s has no control markers left", p.ID)
		}
		p.ControlMarkersPlaced++
		checkWin(s)
		return nil
	default:
		return fmt.Errorf("unknown action %q", a.Type)
	}
}

// RunTurn executes the four phases of the current player's turn, applying the
// given action-phase actions in order, then advances to the next player.
func RunTurn(s *domain.GameState, actions []Action) error {
	// 1. Beginning: clear once-per-turn markers; (begin-of-turn effects: planned).
	s.Phase = domain.PhaseBeginning
	s.CurrentPlayerPtr().OncePerTurnUsed = map[string]bool{}

	// 2. Action.
	s.Phase = domain.PhaseAction
	for _, a := range actions {
		if s.WinnerID != "" {
			break
		}
		if err := Apply(s, a); err != nil {
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
