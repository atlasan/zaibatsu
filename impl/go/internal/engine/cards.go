package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Action-card use resolution: playing cards from hand to drive the core
// abilities. Mirrors impl/ts/src/engine/cards.ts. See DOCS/rules/speedrunners.md
// ("Action cards — ways to use an action card"). Backlog: card-use resolution.
//
// An action card is multi-use; one use is chosen per play. This layer covers the
// ability-activation uses:
//   - Delete / Icebreaker: play ONE card whose `activates` lists the ability.
//   - Search: discard ONE card (any card).
//   - Reboot: discard FOUR cards (any cards).
// The remaining two uses — activate card movement, and attach to an element — are
// deferred (they depend on space-to-space movement and the attach system).
//
// Consumed cards move to the discard pile. Illegal plays are rejected WITHOUT
// consuming a card; a legal play (including a Delete/Icebreak that rolls a miss)
// consumes it.

// cardByID returns the action-card definition with the given id, or nil.
func cardByID(gd *domain.GameData, id string) *domain.ActionCard {
	for i := range gd.Cards {
		if gd.Cards[i].ID == id {
			return &gd.Cards[i]
		}
	}
	return nil
}

// cardInHand reports whether the player holds at least one copy of cardID.
func cardInHand(p *domain.Player, cardID string) bool {
	for _, c := range p.Hand {
		if c == cardID {
			return true
		}
	}
	return false
}

// cardActivates reports whether the card can activate the named ability.
func cardActivates(gd *domain.GameData, cardID, ability string) bool {
	c := cardByID(gd, cardID)
	if c == nil {
		return false
	}
	for _, a := range c.Activates {
		if a == ability {
			return true
		}
	}
	return false
}

// consumeCard removes one copy of cardID from the player's hand and moves it to
// the discard pile.
func consumeCard(s *domain.GameState, p *domain.Player, cardID string) error {
	for i, c := range p.Hand {
		if c == cardID {
			p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)
			s.Discard = append(s.Discard, cardID)
			return nil
		}
	}
	return fmt.Errorf("card %q is not in %s's hand", cardID, p.ID)
}

// handContainsAll reports whether the player holds all of the given cards,
// counting duplicates.
func handContainsAll(p *domain.Player, cardIDs []string) bool {
	counts := map[string]int{}
	for _, c := range p.Hand {
		counts[c]++
	}
	for _, id := range cardIDs {
		if counts[id] <= 0 {
			return false
		}
		counts[id]--
	}
	return true
}

// requireOwnedActor validates that pawnID is on the board and controlled by playerID.
func requireOwnedActor(s *domain.GameState, playerID, pawnID string) error {
	pob := s.Cybernet.PawnByID(pawnID)
	if pob == nil {
		return fmt.Errorf("pawn %q is not on the board", pawnID)
	}
	if pob.OwnerID != playerID {
		return fmt.Errorf("pawn %q is not controlled by %s", pawnID, playerID)
	}
	return nil
}

// PlayDelete plays a Delete-capable card to activate the attacker's Delete
// ability against a co-located target. The card is consumed only if the play is
// legal (a rolled miss still consumes it).
func PlayDelete(s *domain.GameState, gd *domain.GameData, playerID, cardID, attackerID, targetID string, extraSkulls int) (DeleteResult, error) {
	var res DeleteResult
	player := s.PlayerByID(playerID)
	if player == nil {
		return res, fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return res, fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	if !cardActivates(gd, cardID, "delete") {
		return res, fmt.Errorf("card %q cannot activate Delete", cardID)
	}
	if err := requireOwnedActor(s, playerID, attackerID); err != nil {
		return res, err
	}
	res, err := Delete(s, gd, attackerID, targetID, extraSkulls)
	if err != nil {
		return res, err
	}
	_ = consumeCard(s, player, cardID)
	return res, nil
}

// PlayIcebreakBlock plays an Icebreaker-capable card to Icebreak the block the
// attacker occupies.
func PlayIcebreakBlock(s *domain.GameState, gd *domain.GameData, playerID, cardID, attackerID string, coord domain.Coord, extraRollDice int) (IcebreakResult, error) {
	var res IcebreakResult
	player := s.PlayerByID(playerID)
	if player == nil {
		return res, fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return res, fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	if !cardActivates(gd, cardID, "icebreaker") {
		return res, fmt.Errorf("card %q cannot activate Icebreaker", cardID)
	}
	if err := requireOwnedActor(s, playerID, attackerID); err != nil {
		return res, err
	}
	res, err := IcebreakBlock(s, gd, attackerID, coord, extraRollDice)
	if err != nil {
		return res, err
	}
	_ = consumeCard(s, player, cardID)
	return res, nil
}

// PlayIcebreakPawn plays an Icebreaker-capable card to Icebreak a co-located pawn.
func PlayIcebreakPawn(s *domain.GameState, gd *domain.GameData, playerID, cardID, attackerID, targetID string, extraRollDice int) (IcebreakResult, error) {
	var res IcebreakResult
	player := s.PlayerByID(playerID)
	if player == nil {
		return res, fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return res, fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	if !cardActivates(gd, cardID, "icebreaker") {
		return res, fmt.Errorf("card %q cannot activate Icebreaker", cardID)
	}
	if err := requireOwnedActor(s, playerID, attackerID); err != nil {
		return res, err
	}
	res, err := IcebreakPawn(s, gd, attackerID, targetID, extraRollDice)
	if err != nil {
		return res, err
	}
	_ = consumeCard(s, player, cardID)
	return res, nil
}

// PlaySearch discards one card (any card) to activate a pawn's Search ability.
func PlaySearch(s *domain.GameState, gd *domain.GameData, playerID, cardID, pawnID string, dir, rot int) (*domain.PlacedBlock, error) {
	player := s.PlayerByID(playerID)
	if player == nil {
		return nil, fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return nil, fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	if err := requireOwnedActor(s, playerID, pawnID); err != nil {
		return nil, err
	}
	pb, err := Search(s, gd, pawnID, dir, rot)
	if err != nil {
		return nil, err
	}
	_ = consumeCard(s, player, cardID)
	return pb, nil
}

// PlayReboot discards four cards (any cards) to activate Reboot on an eliminated
// pawn, returning it to the Central Core under playerID's control.
func PlayReboot(s *domain.GameState, gd *domain.GameData, playerID string, cardIDs []string, pawnID string) (*domain.PawnOnBoard, error) {
	player := s.PlayerByID(playerID)
	if player == nil {
		return nil, fmt.Errorf("unknown player %q", playerID)
	}
	if len(cardIDs) != 4 {
		return nil, fmt.Errorf("Reboot requires discarding exactly 4 cards, got %d", len(cardIDs))
	}
	if !handContainsAll(player, cardIDs) {
		return nil, fmt.Errorf("%s does not hold all 4 cards to discard", playerID)
	}
	pob, err := Reboot(s, gd, pawnID, playerID)
	if err != nil {
		return nil, err
	}
	for _, c := range cardIDs {
		_ = consumeCard(s, player, c)
	}
	return pob, nil
}
