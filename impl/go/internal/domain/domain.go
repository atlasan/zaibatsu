// Package domain holds the Zaibatsu entity types and game state — pure data and
// logic with no I/O. It mirrors impl/ts/src/domain. See DOCS/domain-model.md and
// DOCS/parity.md.
package domain

// Expansion identifies which component set an entity belongs to.
type Expansion string

const (
	ExpSpeedrunners  Expansion = "speedrunners"
	ExpShadowraiders Expansion = "shadowraiders"
)

// Phase is a step of a player's turn. See DOCS/turn-flow.md.
type Phase string

const (
	PhaseBeginning Phase = "beginning"
	PhaseAction    Phase = "action"
	PhaseRecycle   Phase = "recycle"
	PhaseEnd       Phase = "end"
)

// IceValue is defense against Icebreaker: low=3 dice, medium=2, high=1, black=Black ICE.
type IceValue string

const (
	IceNone   IceValue = "none"
	IceLow    IceValue = "low"
	IceMedium IceValue = "medium"
	IceHigh   IceValue = "high"
	IceBlack  IceValue = "black"
)

// DefenseDie is one die of a pawn's defense. A match on an unshielded die eliminates the pawn.
type DefenseDie struct {
	Value    int  `json:"value"`
	Shielded bool `json:"shielded"`
}

// SpaceModifier tweaks a space's behavior (defense / hand-size / attack).
type SpaceModifier struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount"`
}

// Space is a cell on a block that pawns occupy.
type Space struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	PawnID   string         `json:"pawnId,omitempty"`
	EffectID string         `json:"effectId,omitempty"`
	Modifier *SpaceModifier `json:"modifier,omitempty"`
}

// BlockEffects holds effect ids fired at placement / on gaining control.
type BlockEffects struct {
	InCybernet   string `json:"inCybernet,omitempty"`
	UnderControl string `json:"underControl,omitempty"`
}

// Block is a hexagonal Cybernet tile.
type Block struct {
	ID             string       `json:"id"`
	Name           string       `json:"name"`
	Expansion      Expansion    `json:"expansion"`
	IsCentralCore  bool         `json:"isCentralCore,omitempty"`
	IceValue       IceValue     `json:"iceValue,omitempty"`
	Edges          []bool       `json:"edges,omitempty"`
	BonusFragments int          `json:"bonusFragments,omitempty"`
	Spaces         []Space      `json:"spaces,omitempty"`
	Effects        BlockEffects `json:"effects,omitempty"`
	Provisional    bool         `json:"provisional,omitempty"`
}

// Movement describes how a pawn moves.
type Movement struct {
	Type       string `json:"type"`
	Steps      int    `json:"steps,omitempty"`
	Activation string `json:"activation"`
}

// Ability is a pawn ability with its activation mode.
type Ability struct {
	Ability    string `json:"ability"`
	Activation string `json:"activation"`
	Skulls     int    `json:"skulls,omitempty"`
}

// Pawn is an agent: piece (position) + control card (attributes).
type Pawn struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Expansion   Expansion `json:"expansion"`
	Class       []string  `json:"class"`
	Defense     []DefenseDie `json:"defense"`
	Movement    Movement  `json:"movement"`
	Abilities   []Ability `json:"abilities,omitempty"`
	IceValue    IceValue  `json:"iceValue,omitempty"`
	Slots       []string  `json:"slots,omitempty"`
	Special     string    `json:"special,omitempty"`
	IsStarter   bool      `json:"isStarter,omitempty"`
	MercCost    int       `json:"mercCost,omitempty"`
	Provisional bool      `json:"provisional,omitempty"`
}

// Attach describes how an action card may attach to a game element.
type Attach struct {
	As    string   `json:"as"`
	Slot  string   `json:"slot,omitempty"`
	Class []string `json:"class,omitempty"`
	Cost  int      `json:"cost,omitempty"`
}

// ActionCard is a multi-use card from the shared action deck.
type ActionCard struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Copies      int      `json:"copies,omitempty"`
	Movement    int      `json:"movement,omitempty"`
	Activates   []string `json:"activates,omitempty"`
	Attach      *Attach  `json:"attach,omitempty"`
	Provisional bool     `json:"provisional,omitempty"`
}

// Mode is a playable game mode definition.
type Mode struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Expansions     []Expansion    `json:"expansions,omitempty"`
	Players        PlayerRange    `json:"players"`
	ControlMarkers map[string]int `json:"controlMarkers"`
	MaxHandSize    int            `json:"maxHandSize,omitempty"`
	StartingHand   []int          `json:"startingHand,omitempty"`
	Win            []string       `json:"win,omitempty"`
	Lose           []string       `json:"lose,omitempty"`
	Notes          string         `json:"notes,omitempty"`
}

// PlayerRange is a mode's supported player count.
type PlayerRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// GameData is the loaded, validated content the engine plays with.
type GameData struct {
	Blocks []Block
	Pawns  []Pawn
	Cards  []ActionCard
	Mode   Mode
}

// Player is a Zaibatsu — one participant.
type Player struct {
	ID                   string   `json:"id"`
	Name                 string   `json:"name"`
	Color                string   `json:"color"`
	PawnID               string   `json:"pawnId"`
	ControlMarkersTotal  int      `json:"controlMarkersTotal"`
	ControlMarkersPlaced int      `json:"controlMarkersPlaced"`
	BonusCounters        int      `json:"bonusCounters"`
	Hand                 []string `json:"hand"`
	MaxHandSize          int      `json:"maxHandSize"`
	// OncePerTurnUsed tracks abilities spent this turn (cleared each beginning phase).
	OncePerTurnUsed map[string]bool `json:"oncePerTurnUsed,omitempty"`
}

// MarkersRemaining is how many control markers the player has left to place.
func (p *Player) MarkersRemaining() int {
	return p.ControlMarkersTotal - p.ControlMarkersPlaced
}

// GameState is the full, replayable state of a game.
type GameState struct {
	Players       []*Player `json:"players"`
	CurrentPlayer int       `json:"currentPlayer"`
	Turn          int       `json:"turn"`
	Phase         Phase     `json:"phase"`
	Deck          []string  `json:"deck"`
	Discard       []string  `json:"discard"`
	BlockPile     []string  `json:"blockPile"`
	WinnerID      string    `json:"winnerId,omitempty"`
	RNG           *RNG      `json:"-"`
}

// CurrentPlayerPtr returns the player whose turn it is.
func (s *GameState) CurrentPlayerPtr() *Player {
	return s.Players[s.CurrentPlayer]
}
