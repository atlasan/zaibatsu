// Package domain holds the Zaibatsu entity types and game state — pure data and
// logic with no I/O. It mirrors impl/ts/src/domain. See DOCS/domain-model.md and
// DOCS/parity.md.
package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
)

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
// SpaceLocation is a normalized visual/source position in the block crop; it has no movement semantics.
type SpaceLocation struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// SpaceGridCell is one axial coordinate on the source-layout pointy-hex grid.
type SpaceGridCell struct {
	Q int `json:"q"`
	R int `json:"r"`
}

// SpaceFootprint describes printed source-layout coverage; it never changes runtime movement or capacity.
type SpaceFootprint struct {
	Shape string          `json:"shape"`
	Cells []SpaceGridCell `json:"cells"`
}

// SpaceCapacity is an explicit finite capacity or UnlimitedCapacity. Zero means legacy/unset.
type ExplicitSpaceCapacity int

const UnlimitedCapacity ExplicitSpaceCapacity = -1

func (c *ExplicitSpaceCapacity) UnmarshalJSON(data []byte) error {
	if string(data) == `"unlimited"` {
		*c = UnlimitedCapacity
		return nil
	}
	var value int
	if err := json.Unmarshal(data, &value); err != nil || value < 1 {
		return fmt.Errorf("space capacity must be a positive integer or unlimited")
	}
	*c = ExplicitSpaceCapacity(value)
	return nil
}
func (c ExplicitSpaceCapacity) MarshalJSON() ([]byte, error) {
	if c == UnlimitedCapacity {
		return []byte(`"unlimited"`), nil
	}
	if c < 1 {
		return []byte("null"), nil
	}
	return json.Marshal(int(c))
}

// Space is a gameplay location on a block. ZoneIDs are standardized source-aligned placement hexes;
// neighbors are inferred candidates for future step movement.
type Space struct {
	ID           string                `json:"id"`
	Type         string                `json:"type"`
	ZoneIDs      []string              `json:"zoneIds,omitempty"`
	Capacity     ExplicitSpaceCapacity `json:"capacity,omitempty"`
	CapacityNote string                `json:"capacityNote,omitempty"`
	// DisplayShape is source-facing/editor metadata only; it has no runtime behavior.
	DisplayShape string          `json:"displayShape,omitempty"`
	Neighbors    []string        `json:"neighbors,omitempty"`
	PawnID       string          `json:"pawnId,omitempty"`
	EffectID     string          `json:"effectId,omitempty"`
	Location     *SpaceLocation  `json:"location,omitempty"`
	Footprint    *SpaceFootprint `json:"footprint,omitempty"`
	Modifier     *SpaceModifier  `json:"modifier,omitempty"`
	// Direction restricts pawn exit to a single edge (0=top, clockwise); nil = unrestricted.
	Direction *int `json:"direction,omitempty"`
}

// BlockEffect is a block effect: a bare source effect-id (legacy string form) or
// a typed action (kind + optional amount/target/text). It round-trips back to a
// bare string when only the id is set, keeping existing data byte-identical.
type BlockEffect struct {
	ID     string `json:"-"`
	Kind   string `json:"kind,omitempty"`
	Amount int    `json:"amount,omitempty"`
	Target string `json:"target,omitempty"`
	Text   string `json:"text,omitempty"`
}

func (e *BlockEffect) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) > 0 && b[0] == '"' {
		return json.Unmarshal(b, &e.ID)
	}
	type raw BlockEffect
	return json.Unmarshal(b, (*raw)(e))
}

func (e BlockEffect) MarshalJSON() ([]byte, error) {
	if e.Kind == "" {
		return json.Marshal(e.ID)
	}
	type raw BlockEffect
	return json.Marshal(raw(e))
}

// BlockEffects holds effects fired at placement / on gaining control. Each is a
// legacy effect-id string or a typed BlockEffect.
type BlockEffects struct {
	InCybernet   *BlockEffect `json:"inCybernet,omitempty"`
	UnderControl *BlockEffect `json:"underControl,omitempty"`
}

// Block is a hexagonal Cybernet tile.
type Block struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Expansion     Expansion `json:"expansion"`
	LayoutID      string    `json:"layoutId,omitempty"`
	IsCentralCore bool      `json:"isCentralCore,omitempty"`
	IceValue      IceValue  `json:"iceValue,omitempty"`
	// IceFaces are the specific 1-6 die faces a successful Icebreak must match.
	// When present the engine uses these instead of deriving from IceValue.
	IceFaces []int `json:"iceFaces,omitempty"`
	// BlackIce marks a block whose failed Icebreak eliminates the attacker.
	BlackIce bool   `json:"blackIce,omitempty"`
	Edges    []bool `json:"edges,omitempty"`
	// BoundarySpaces is derived from each open entrance's mapped ring zone; it is not hand-authored.
	BoundarySpaces [][]string   `json:"boundarySpaces,omitempty"`
	BonusFragments int          `json:"bonusFragments,omitempty"`
	BonusCorners   []bool       `json:"bonusCorners,omitempty"`
	Spaces         []Space      `json:"spaces,omitempty"`
	AssetRefs      []string     `json:"assetRefs,omitempty"`
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
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Expansion   Expansion    `json:"expansion"`
	LayoutID    string       `json:"layoutId,omitempty"`
	Class       []string     `json:"class"`
	Defense     []DefenseDie `json:"defense"`
	Movement    Movement     `json:"movement"`
	Abilities   []Ability    `json:"abilities,omitempty"`
	IceValue    IceValue     `json:"iceValue,omitempty"`
	Slots       []string     `json:"slots,omitempty"`
	Special     string       `json:"special,omitempty"`
	IsStarter   bool         `json:"isStarter,omitempty"`
	MercCost    int          `json:"mercCost,omitempty"`
	Provisional bool         `json:"provisional,omitempty"`
}

// Attach describes how an action card may attach to a game element, and what it
// confers on the target (grants/removes abilities, plus a special effect text).
type Attach struct {
	As         string   `json:"as"`
	Slot       string   `json:"slot,omitempty"`
	Class      []string `json:"class,omitempty"`
	Grants     []string `json:"grants,omitempty"`
	Removes    []string `json:"removes,omitempty"`
	EffectText string   `json:"effectText,omitempty"`
	Cost       int      `json:"cost,omitempty"`
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

// ControlCard is a physical card that controls a pawn or block.
type ControlCard struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Expansion   Expansion   `json:"expansion"`
	LayoutID    string      `json:"layoutId,omitempty"`
	Subject     CardSubject `json:"subject"`
	IsStarter   bool        `json:"isStarter,omitempty"`
	Provisional bool        `json:"provisional,omitempty"`
}

type CardSubject struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// Threat is a Shadowraiders hostile entity. Resolution remains an engine concern.
type Threat struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	AttackDie   int      `json:"attackDie,omitempty"`
	Effects     []string `json:"effects,omitempty"`
	Provisional bool     `json:"provisional,omitempty"`
}

// MissionCard holds data for a Shadowraiders mission and its normalized reward.
type MissionCard struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Tags        []string      `json:"tags"`
	Cost        int           `json:"cost,omitempty"`
	Reward      MissionReward `json:"reward"`
	Provisional bool          `json:"provisional,omitempty"`
}

type MissionReward struct {
	Medals int    `json:"medals,omitempty"`
	PawnID string `json:"pawnId,omitempty"`
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
	Blocks       []Block
	Pawns        []Pawn
	Cards        []ActionCard
	Mode         Mode
	ControlCards []ControlCard
	Threats      []Threat
	Missions     []MissionCard
	Modes        []Mode
}

// BlockByID returns the block definition with the given id.
func (gd *GameData) BlockByID(id string) (*Block, bool) {
	for i := range gd.Blocks {
		if gd.Blocks[i].ID == id {
			return &gd.Blocks[i], true
		}
	}
	return nil, false
}

// CentralCore returns the single Central Core block definition.
func (gd *GameData) CentralCore() (*Block, bool) {
	for i := range gd.Blocks {
		if gd.Blocks[i].IsCentralCore {
			return &gd.Blocks[i], true
		}
	}
	return nil, false
}

// PawnByID returns the pawn definition with the given id.
func (gd *GameData) PawnByID(id string) (*Pawn, bool) {
	for i := range gd.Pawns {
		if gd.Pawns[i].ID == id {
			return &gd.Pawns[i], true
		}
	}
	return nil, false
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
	Cybernet      *Cybernet `json:"cybernet"`
	// Eliminated holds pawn ids removed from the Cybernet. A Reboot re-enters one
	// at the Central Core under the rebooting player's control.
	Eliminated []string `json:"eliminated"`
	WinnerID   string   `json:"winnerId,omitempty"`
	RNG        *RNG     `json:"-"`
}

// CurrentPlayerPtr returns the player whose turn it is.
func (s *GameState) CurrentPlayerPtr() *Player {
	return s.Players[s.CurrentPlayer]
}

// PlayerByID returns the player with the given id, or nil.
func (s *GameState) PlayerByID(id string) *Player {
	for _, p := range s.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}
