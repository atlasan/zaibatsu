package engine

import (
	"encoding/json"
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// ControllerHandRevealed follows the attached pawn's current controller.
func ControllerHandRevealed(s *domain.GameState, gd *domain.GameData, playerID string) bool {
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.OwnerID != playerID {
			continue
		}
		for _, att := range pawn.Attachments {
			card := cardByID(gd, att.CardID)
			if card != nil && card.Attach != nil && card.Attach.ControllerHand == "face-up" {
				return true
			}
		}
	}
	return false
}

type ViewHand struct {
	Count      int      `json:"count"`
	Visibility string   `json:"visibility"`
	Cards      []string `json:"cards"`
}
type ViewPlayer struct {
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	Color         string           `json:"color"`
	PawnID        string           `json:"pawnId"`
	MarkersTotal  int              `json:"markersTotal"`
	MarkersPlaced int              `json:"markersPlaced"`
	Bonus         int              `json:"bonus"`
	OncePerTurn   []string         `json:"oncePerTurn"`
	Hand          ViewHand         `json:"hand"`
	HandSize      *HandSizeProfile `json:"handSize,omitempty"`
}
type ViewPiles struct {
	Deck       int `json:"deck"`
	BlockPile  int `json:"blockPile"`
	ThreatPile int `json:"threatPile"`
}
type ViewDecision struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	PlayerID string `json:"playerId"`
}

// PlayerViewState is a whitelist: future state fields require a deliberate visibility decision.
type ViewRevealedBlock struct {
	BlockID   string       `json:"blockId"`
	Reference domain.Coord `json:"reference"`
}
type ViewBlockDiscards struct {
	BlockID   string                        `json:"blockId"`
	Coord     domain.Coord                  `json:"coord"`
	Decisions []domain.BlockDiscardDecision `json:"decisions"`
}
type PlayerViewState struct {
	BonusPool          *BonusPool                     `json:"bonusPool,omitempty"`
	BlockSacrifices    *domain.PendingBlockSacrifices `json:"blockSacrifices,omitempty"`
	BlockDiscards      *ViewBlockDiscards             `json:"blockDiscards,omitempty"`
	ControlCardMarkers []domain.ControlCardMarker     `json:"controlCardMarkers,omitempty"`
	UseMarkers         []UseMarkerAllocation          `json:"useMarkers"`
	Movement           *domain.PendingMovement        `json:"movement,omitempty"`
	RevealedBlock      *ViewRevealedBlock             `json:"revealedBlock,omitempty"`
	Format             string                         `json:"format"`
	ViewerID           string                         `json:"viewerId"`
	Turn               int                            `json:"turn"`
	Phase              domain.Phase                   `json:"phase"`
	CurrentPlayer      int                            `json:"currentPlayer"`
	WinnerID           string                         `json:"winnerId"`
	Players            []ViewPlayer                   `json:"players"`
	Piles              ViewPiles                      `json:"piles"`
	Discard            []string                       `json:"discard"`
	PlayedCards        []string                       `json:"playedCards"`
	PlayedCardOwners   []string                       `json:"playedCardOwners,omitempty"`
	Eliminated         []string                       `json:"eliminated"`
	Reserve            []string                       `json:"reserve"`
	OutOfGame          []string                       `json:"outOfGame"`
	BonusIcons         []snapBonus                    `json:"bonusIcons"`
	Blocks             []snapBlock                    `json:"blocks"`
	Pawns              []snapPawn                     `json:"pawns"`
	ControlCards       []domain.ControlCardState      `json:"controlCards"`
	Threats            []domain.ThreatOnBoard         `json:"threats"`
	ClearedEvents      []string                       `json:"clearedEvents"`
	PendingAttack      *domain.PendingAttack          `json:"pendingAttack,omitempty"`
	PendingThreats     *domain.PendingThreatCombat    `json:"pendingThreats,omitempty"`
	Decision           *ViewDecision                  `json:"decision,omitempty"`
	PendingChoice      *domain.PendingChoice          `json:"pendingChoice,omitempty"`
	Options            []AvailableAction              `json:"options"`
}

func validateViewer(s *domain.GameState, viewerID string) error {
	if viewerID == "" {
		return nil
	}
	for _, p := range s.Players {
		if p.ID == viewerID {
			return nil
		}
	}
	return fmt.Errorf("unknown player-view viewer")
}

// PlayerView returns a detached projection; empty viewerID means spectator. No seed, trace or RNG.
func PlayerView(s *domain.GameState, gd *domain.GameData, viewerID string) (PlayerViewState, error) {
	if err := validateViewer(s, viewerID); err != nil {
		return PlayerViewState{}, err
	}
	var raw snapshotDTO
	if err := json.Unmarshal([]byte(Snapshot(s)), &raw); err != nil {
		return PlayerViewState{}, err
	}
	v := PlayerViewState{UseMarkers: UseMarkerAllocations(s), Format: "zaibatsu-player-view/v1", ViewerID: viewerID, Turn: s.Turn, Phase: s.Phase, CurrentPlayer: s.CurrentPlayer, WinnerID: s.WinnerID,
		Players: []ViewPlayer{}, Piles: ViewPiles{len(s.Deck), len(s.BlockPile), len(s.ThreatPile)}, Discard: raw.Discard, PlayedCards: raw.PlayedCards, PlayedCardOwners: s.PlayedCardOwners, Eliminated: raw.Eliminated,
		ControlCardMarkers: raw.ControlCardMarkers, Reserve: []string{}, OutOfGame: []string{}, BonusIcons: raw.BonusIcons, Blocks: raw.Blocks, Pawns: raw.Pawns, ControlCards: raw.ControlCards, Threats: raw.Threats, ClearedEvents: strSlice(raw.ClearedEvents),
		PendingAttack: raw.PendingAttack, PendingThreats: raw.PendingThreats, Options: []AvailableAction{}}
	pool, err := BonusCounterPool(s)
	if err != nil {
		return PlayerViewState{}, err
	}
	v.BonusPool = pool
	if v.ControlCards == nil {
		v.ControlCards = []domain.ControlCardState{}
	}
	if v.Threats == nil {
		v.Threats = []domain.ThreatOnBoard{}
	}
	if raw.Reserve != nil {
		v.Reserve = *raw.Reserve
	}
	if raw.OutOfGame != nil {
		v.OutOfGame = *raw.OutOfGame
	}
	for _, p := range s.Players {
		visibility := "hidden"
		cards := []string{}
		if ControllerHandRevealed(s, gd, p.ID) {
			visibility = "face-up"
		} else if p.ID == viewerID {
			visibility = "owner"
		}
		if visibility != "hidden" {
			cards = append(cards, p.Hand...)
		}
		vp := ViewPlayer{p.ID, p.Name, p.Color, p.PawnID, p.ControlMarkersTotal, p.ControlMarkersPlaced, p.BonusCounters, sortedKeys(p.OncePerTurnUsed), ViewHand{len(p.Hand), visibility, cards}, nil}
		if s.RulesVersion != "" {
			profile, err := HandSizeProfileFor(s, gd, p.ID)
			if err != nil {
				return v, err
			}
			vp.HandSize = &profile
		}
		v.Players = append(v.Players, vp)
	}
	responderID := ""
	if s.CurrentPlayer >= 0 && s.CurrentPlayer < len(s.Players) {
		responderID = s.Players[s.CurrentPlayer].ID
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "place-block" && s.PendingChoice.BlockID != "" && s.PendingChoice.Reference != nil {
		v.RevealedBlock = &ViewRevealedBlock{s.PendingChoice.BlockID, *s.PendingChoice.Reference}
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "move-path" {
		v.Movement = raw.PendingChoice.Movement
	}
	if s.PendingChoice != nil {
		responderID = s.PendingChoice.PlayerID
		v.Decision = &ViewDecision{s.PendingChoice.ID, s.PendingChoice.Kind, s.PendingChoice.PlayerID}
		if viewerID == responderID {
			v.PendingChoice = raw.PendingChoice
		}
	}
	if viewerID != "" && viewerID == responderID {
		v.Options = visibleOptions(s, gd)
	}
	if viewerID != "" && gd.RegressionFixture != "provisional-v1" {
		v.Options = AvailableActions(s, gd, viewerID)
	}
	if batch := s.PendingBlockDiscards; batch != nil {
		v.BlockDiscards = &ViewBlockDiscards{BlockID: batch.BlockID, Coord: batch.Coord, Decisions: []domain.BlockDiscardDecision{}}
		v.PendingChoice = nil
		v.Decision = nil
		v.Options = AvailableActions(s, gd, viewerID)
		for _, d := range batch.Decisions {
			d.CardIDs = nil
			v.BlockDiscards.Decisions = append(v.BlockDiscards.Decisions, d)
			if d.PlayerID == viewerID && !d.Submitted {
				choice := BlockDiscardChoice(s, d.ID)
				v.PendingChoice = choice
				v.Decision = &ViewDecision{ID: choice.ID, Kind: choice.Kind, PlayerID: choice.PlayerID}
			}
		}
	}
	if batch := s.PendingBlockSacrifices; batch != nil {
		v.BlockSacrifices = batch
		v.PendingChoice = nil
		v.Decision = nil
		v.Options = AvailableActions(s, gd, viewerID)
		for _, d := range batch.Decisions {
			if d.PlayerID == viewerID && !d.Submitted {
				choice := BlockSacrificeChoice(s, d.ID)
				v.PendingChoice = choice
				v.Decision = &ViewDecision{ID: choice.ID, Kind: choice.Kind, PlayerID: choice.PlayerID}
			}
		}
	}
	// Query options can carry references to definition/state slices: detach the entire result.
	b, err := json.Marshal(v)
	if err != nil {
		return PlayerViewState{}, err
	}
	var detached PlayerViewState
	err = json.Unmarshal(b, &detached)
	return detached, err
}

// EventsForPlayer never discloses opponents' historical draw identities. The journal
// lacks event-time reveal provenance; current face-up hands are supplied by PlayerView.
func EventsForPlayer(s *domain.GameState, events []EngineEvent, viewerID string) ([]EngineEvent, error) {
	if err := validateViewer(s, viewerID); err != nil {
		return nil, err
	}
	out := []EngineEvent{}
	for _, e := range events {
		if e.Type == EventValidationFail && (viewerID == "" || e.PlayerID != viewerID) {
			continue
		}
		if e.Type == EventDraw {
			draw := EngineEvent{Type: e.Type, PlayerID: e.PlayerID}
			if viewerID != "" && e.PlayerID == viewerID {
				draw.CardID = e.CardID
			}
			e = draw
		}
		if e.Type == "card-stolen" && !e.CardRevealed && (viewerID == "" || viewerID != e.FromOwnerID && viewerID != e.ToOwnerID) {
			e.CardID = ""
		}
		out = append(out, e)
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	var detached []EngineEvent
	err = json.Unmarshal(b, &detached)
	return detached, err
}

// Search placement previews are trusted queries of a face-down tile. Player views
// expose only the declaration, pending a separately revealed placement window.
func visibleOptions(s *domain.GameState, gd *domain.GameData) []AvailableAction {
	if gd.RegressionFixture != "provisional-v1" {
		return AvailableActions(s, gd)
	}
	out := []AvailableAction{}
	for _, option := range AvailableActions(s, gd) {
		if option.Action.Type != ActSearch && option.Action.Type != ActPlaySearch {
			out = append(out, option)
		}
	}
	if s.WinnerID != "" || s.PendingChoice != nil || s.PendingAttack != nil || s.PendingThreats != nil || s.Phase != domain.PhaseAction || len(s.BlockPile) == 0 {
		return out
	}
	player := s.CurrentPlayerPtr()
	for _, placed := range s.Cybernet.Pawns {
		if placed.OwnerID != player.ID {
			continue
		}
		pawn, ok := gd.PawnByID(placed.PawnID)
		if !ok {
			continue
		}
		ability := effectiveAbility(gd, pawn, placed.Attachments, "search")
		if ability == nil || ability.Activation == "none" || (ability.Activation == "once-per-turn" && player.OncePerTurnUsed[abilityUsedKey("search", pawn.ID)]) {
			continue
		}
		if ability.Activation == "card" {
			seen := map[string]bool{}
			for _, cardID := range player.Hand {
				if !seen[cardID] {
					out = append(out, AvailableAction{Action: Action{Type: ActPlaySearch, PawnID: pawn.ID, CardID: cardID}})
					seen[cardID] = true
				}
			}
		} else {
			out = append(out, AvailableAction{Action: Action{Type: ActSearch, PawnID: pawn.ID}})
		}
	}
	return out
}
