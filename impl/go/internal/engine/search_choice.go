package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func SupportsSearchBlockEffect(block *domain.Block) bool {
	effect := block.Effects.InCybernet
	if effect == nil {
		return true
	}
	if effect.Kind == "place-neutral-pawn" && effect.Target != "" && effect.Amount == 0 {
		count := 0
		for _, space := range block.Spaces {
			if space.Type == "pawn" && space.PawnID == effect.Target {
				count++
			}
		}
		return count == 1
	}
	return effect.Kind == "place-block-bonus" && effect.Amount == 1 && effect.Target == "" || effect.Kind == "gain-bonus-all-players" && effect.Amount >= 1 && effect.Target == "" || effect.Kind == "sacrifice-per-player" && effect.Amount == 1 && effect.MinimumControlledPawns >= 1 && effect.Target == "" || effect.Kind == "discard-per-controlled-pawn" && effect.Target == "" && effect.Amount == 0 || effect.Kind == "area-attack" && effect.Target == "" && effect.Amount >= 0
}

// SearchDeclarationError checks public eligibility without inspecting the hidden tile.
func SearchDeclarationError(s *domain.GameState, gd *domain.GameData, playerID, pawnID, cardID string) error {
	if s.WinnerID != "" || s.Phase != domain.PhaseAction || s.PendingChoice != nil || s.PendingPhase != "" || s.PendingAttack != nil || s.PendingThreats != nil {
		return fmt.Errorf("Search cannot begin during pending resolution or outside the action phase")
	}
	player := s.PlayerByID(playerID)
	placed := s.Cybernet.PawnByID(pawnID)
	pawn, ok := gd.PawnByID(pawnID)
	if player == nil || player.ID != s.CurrentPlayerPtr().ID || placed == nil || !ok || placed.OwnerID != playerID {
		return fmt.Errorf("only the active player's controlled pawn may Search")
	}
	ability := effectiveAbility(gd, pawn, placed.Attachments, "search")
	if ability == nil || ability.Activation == "none" {
		return fmt.Errorf("the pawn cannot activate Search")
	}
	if ability.Activation != "card" && ability.Activation != "once-per-turn" {
		return fmt.Errorf("unsupported Search activation")
	}
	if ability.Activation == "card" && (cardID == "" || !cardInHand(player, cardID) || cardByID(gd, cardID) == nil) {
		return fmt.Errorf("Search requires one action card from the controller's hand")
	}
	if ability.Activation == "once-per-turn" && (cardID != "" || AbilityUseSpent(s, gd, player, pawnID, "search")) {
		return fmt.Errorf("free Search is already spent or cannot use a hand card")
	}
	if len(s.BlockPile) == 0 {
		return fmt.Errorf("no blocks left in the pile")
	}
	reference := s.Cybernet.At(placed.Coord)
	if reference != nil {
		if block, ok := gd.BlockByID(reference.BlockID); ok {
			for dir := 0; dir < 6; dir++ {
				if edgeHasSpace(block, reference.Rotation, dir) && !s.Cybernet.Occupied(placed.Coord.Neighbor(dir)) {
					return nil
				}
			}
		}
	}
	return fmt.Errorf("the reference block has no open connecting side")
}

// BeginSearch commits activation and reveals one physical tile into PendingChoice.
func BeginSearch(s *domain.GameState, gd *domain.GameData, playerID, pawnID, cardID string, eventSinks ...*[]EngineEvent) error {
	if err := SearchDeclarationError(s, gd, playerID, pawnID, cardID); err != nil {
		return err
	}
	events := phaseEventSink(eventSinks)
	placed := s.Cybernet.PawnByID(pawnID)
	player := s.PlayerByID(playerID)
	blockID := s.BlockPile[len(s.BlockPile)-1]
	block, ok := gd.BlockByID(blockID)
	connected := false
	if ok {
		for _, edge := range block.Edges {
			connected = connected || edge
		}
	}
	duplicate := false
	for _, pb := range s.Cybernet.Blocks {
		duplicate = duplicate || pb.BlockID == blockID
	}
	if !ok || len(block.Edges) != 6 || !connected || duplicate {
		return fmt.Errorf("unsupported drawn block topology or duplicate physical block")
	}
	if cardID != "" {
		if err := removeCardFromHand(player, cardID); err != nil {
			return err
		}
		s.Discard = append(s.Discard, cardID)
		*events = append(*events, EngineEvent{Type: "card-discarded", CardID: cardID})
	} else {
		SpendAbilityUse(s, gd, player, pawnID, "search")
	}
	s.BlockPile = s.BlockPile[:len(s.BlockPile)-1]
	s.DecisionSerial++
	id := fmt.Sprintf("search-%d", s.DecisionSerial)
	reference := placed.Coord
	s.PendingChoice = &domain.PendingChoice{ID: id, PlayerID: playerID, Kind: "place-block", EffectID: id, PawnID: pawnID, CardID: cardID, BlockID: blockID, Reference: &reference}
	*events = append(*events, EngineEvent{Type: EventBlockDrawn, PlayerID: playerID, PawnID: pawnID, Element: "block", ElementID: blockID, Coord: &reference})
	return nil
}

func SearchPlacementResponses(s *domain.GameState, gd *domain.GameData) []Action {
	out := []Action{}
	choice := s.PendingChoice
	if choice == nil || choice.Kind != "place-block" || choice.Reference == nil || choice.BlockID == "" {
		return out
	}
	for _, p := range ValidPlacements(s.Cybernet, gd, *choice.Reference, choice.BlockID) {
		if BonusPlacementError(s, gd, &domain.PlacedBlock{BlockID: choice.BlockID, Coord: choice.Reference.Neighbor(p.Dir), Rotation: p.Rotation}) != nil {
			continue
		}
		out = append(out, Action{Type: ActResolveChoice, PlayerID: choice.PlayerID, ChoiceID: choice.ID, OptionID: fmt.Sprintf("place:%d:%d", p.Dir, p.Rotation)})
	}
	return out
}

// ResolveSearchPlacement retains the paid activation on rejection via the live reducer.
func ResolveSearchPlacement(s *domain.GameState, gd *domain.GameData, a Action, eventSinks ...*[]EngineEvent) error {
	choice := s.PendingChoice
	option := a.OptionID
	valid := len(option) == 9 && option[:6] == "place:" && option[6] >= '0' && option[6] <= '5' && option[7] == ':' && option[8] >= '0' && option[8] <= '5'
	if choice == nil || choice.Kind != "place-block" || a.ChoiceID != choice.ID || choice.Reference == nil || choice.BlockID == "" || !valid {
		return fmt.Errorf("choose a current Search placement response")
	}
	if a.CardID != "" || len(a.CardIDs) > 0 || a.TargetID != "" || len(a.TargetIDs) > 0 || a.Coord != nil || a.SpaceID != "" || len(a.Path) > 0 || (a.PawnID != "" && a.PawnID != choice.PawnID) {
		return fmt.Errorf("a Search placement cannot change targets or pay another cost")
	}
	pawn := s.Cybernet.PawnByID(choice.PawnID)
	if pawn == nil || pawn.OwnerID != choice.PlayerID || pawn.Coord != *choice.Reference {
		return fmt.Errorf("the Search reference pawn is unavailable")
	}
	block, ok := gd.BlockByID(choice.BlockID)
	if ok && !SupportsSearchBlockEffect(block) {
		return fmt.Errorf("unsupported drawn block placement effect")
	}
	if err := BonusPlacementError(s, gd, &domain.PlacedBlock{BlockID: choice.BlockID, Coord: choice.Reference.Neighbor(int(option[6] - '0')), Rotation: int(option[8] - '0')}); err != nil {
		return err
	}
	bonusKeys := map[string]bool{}
	for _, icon := range s.Cybernet.BonusIcons {
		bonusKeys[icon.Key] = true
	}
	pb, err := PlaceBlock(s, *choice.Reference, int(option[6]-'0'), gd, choice.BlockID, int(option[8]-'0'))
	if err != nil {
		return err
	}
	s.PendingChoice = nil
	events := phaseEventSink(eventSinks)
	coord := pb.Coord
	*events = append(*events, EngineEvent{Type: EventBlockPlaced, PlayerID: choice.PlayerID, PawnID: choice.PawnID, Element: "block", ElementID: pb.BlockID, Coord: &coord})
	for _, icon := range s.Cybernet.BonusIcons {
		if !bonusKeys[icon.Key] {
			*events = append(*events, EngineEvent{Type: EventBonusIconCreated, Element: "bonus-icon", ElementID: icon.Key})
			if icon.CounterPlaced {
				*events = append(*events, EngineEvent{Type: EventBonusCounterPlaced, Element: "bonus-icon", ElementID: icon.Key, Amount: 1})
			}
		}
	}
	result, err := ApplyBlockEffectForTrigger(s, gd, pb.Coord, BlockEffectInCybernet, events)
	if err != nil {
		return err
	}
	if result != nil && result.Kind == "area-attack" && result.Result != nil {
		*events = append(*events, EngineEvent{Type: EventRoll, PlayerID: choice.PlayerID, ActionType: ActResolveChoice, Roll: append([]int{}, result.Result.Roll...)})
	}
	if result != nil && result.Kind == "gain-bonus-all-players" {
		for _, id := range result.PlayerIDs {
			*events = append(*events, EngineEvent{Type: EventBonusAwarded, PlayerID: id, Element: "block", ElementID: pb.BlockID, Amount: result.Amount})
		}
	}
	checkWin(s)
	if s.WinnerID == "" && s.PendingBlockSacrifices == nil && s.PendingBlockDiscards == nil {
		return DeployThreats(s, gd, pb.Coord)
	}
	return nil
}
