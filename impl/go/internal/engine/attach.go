package engine

import (
	"fmt"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Card attachment: attaching action cards to pawns, enemy pawns, and blocks.
// Mirrors impl/ts/src/engine/attach.ts. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
// ("Attaching cards", "Pawn attachment cards"). Backlog: card attachment.
//
// A card with an `attach` spec attaches to the element kind it names
// (pawn = your own, enemy = an opponent's pawn, block = an information block).
// Rules enforced here:
//   - the card must be in the player's hand and have a matching `attach.as`;
//   - the acting pawn must be under the player's control and co-located with the
//     target (for enemy) / on the block (for block);
//   - a pawn/enemy target must expose the required slot and it must be empty;
//   - a block target must have an ICE value;
//   - a bonus-counter cost must be affordable; the counters are moved onto the
//     attachment and returned to the owner when the attachment is discarded.
// The attached card leaves the hand and becomes part of the element (it is NOT
// discarded). Discard happens on elimination / takeover (see discardAttachments).
//
// DEFERRED: applying attached effects during resolution (armor replacing defense
// dice, weapon/gadget/ability grants, movement grants). Attachments are stored
// and cleaned up; wiring their effects into combat/movement is a later task.

// removeCardFromHand removes one copy of cardID from the hand without discarding it.
func removeCardFromHand(p *domain.Player, cardID string) error {
	for i, c := range p.Hand {
		if c == cardID {
			p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("card %q is not in %s's hand", cardID, p.ID)
}

// discardAttachments moves a pawn's attached cards to the discard pile and returns
// any bonus counters they held to the pawn's current owner. Used when a pawn is
// eliminated or changes control.
func discardAttachments(s *domain.GameState, pob *domain.PawnOnBoard) {
	if pob == nil || len(pob.Attachments) == 0 {
		return
	}
	owner := s.PlayerByID(pob.OwnerID)
	for _, a := range pob.Attachments {
		s.Discard = append(s.Discard, a.CardID)
		if a.BonusPaid > 0 && owner != nil {
			owner.BonusCounters += a.BonusPaid
		}
	}
	pob.Attachments = nil
}

// payAttachCost validates and deducts a card's bonus-counter cost, returning the
// amount moved onto the attachment.
func payAttachCost(player *domain.Player, attach *domain.Attach) (int, error) {
	cost := 0
	if attach != nil {
		cost = attach.Cost
	}
	if cost > player.BonusCounters {
		return 0, fmt.Errorf("player %s cannot afford the %d bonus-counter cost", player.ID, cost)
	}
	player.BonusCounters -= cost
	return cost, nil
}

// AttachToPawn attaches a `pawn` card to a pawn the player controls.
func AttachToPawn(s *domain.GameState, gd *domain.GameData, playerID, cardID, targetPawnID string) error {
	player := s.PlayerByID(playerID)
	if player == nil {
		return fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	card := cardByID(gd, cardID)
	if card == nil || card.Attach == nil || card.Attach.As != "pawn" {
		return fmt.Errorf("card %q cannot attach to a pawn you control", cardID)
	}
	tgt := s.Cybernet.PawnByID(targetPawnID)
	if tgt == nil {
		return fmt.Errorf("pawn %q is not on the board", targetPawnID)
	}
	if tgt.OwnerID != playerID {
		return fmt.Errorf("pawn %q is not controlled by %s", targetPawnID, playerID)
	}
	return attachToPawnElement(s, gd, player, card, tgt)
}

// AttachToEnemy attaches an `enemy` card to an opponent's pawn co-located with an
// acting pawn the player controls.
func AttachToEnemy(s *domain.GameState, gd *domain.GameData, playerID, cardID, actorPawnID, targetPawnID string) error {
	player := s.PlayerByID(playerID)
	if player == nil {
		return fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	card := cardByID(gd, cardID)
	if card == nil || card.Attach == nil || card.Attach.As != "enemy" {
		return fmt.Errorf("card %q is not an enemy attachment", cardID)
	}
	if err := requireOwnedActor(s, playerID, actorPawnID); err != nil {
		return err
	}
	actor := s.Cybernet.PawnByID(actorPawnID)
	tgt := s.Cybernet.PawnByID(targetPawnID)
	if tgt == nil {
		return fmt.Errorf("target pawn %q is not on the board", targetPawnID)
	}
	if tgt.OwnerID == playerID {
		return fmt.Errorf("enemy attachment must target another player's pawn")
	}
	if actor.Coord != tgt.Coord {
		return fmt.Errorf("acting pawn and target are not in the same block")
	}
	return attachToPawnElement(s, gd, player, card, tgt)
}

// attachToPawnElement performs the slot + cost checks and attaches to a pawn.
func attachToPawnElement(s *domain.GameState, gd *domain.GameData, player *domain.Player, card *domain.ActionCard, tgt *domain.PawnOnBoard) error {
	slot := card.Attach.Slot
	if slot == "" {
		return fmt.Errorf("card %q has no slot to attach into", card.ID)
	}
	def, ok := gd.PawnByID(tgt.PawnID)
	if !ok {
		return fmt.Errorf("unknown pawn %q", tgt.PawnID)
	}
	if !hasSlot(def, slot) {
		return fmt.Errorf("pawn %q has no %s slot", tgt.PawnID, slot)
	}
	if tgt.HasSlotFilled(slot) {
		return fmt.Errorf("pawn %q already has its %s slot filled", tgt.PawnID, slot)
	}
	paid, err := payAttachCost(player, card.Attach)
	if err != nil {
		return err
	}
	if err := removeCardFromHand(player, card.ID); err != nil {
		player.BonusCounters += paid // refund on the (unexpected) failure
		return err
	}
	tgt.Attachments = append(tgt.Attachments, domain.Attachment{CardID: card.ID, Slot: slot, BonusPaid: paid})
	return nil
}

// AttachToBlock attaches a `block` card to the block an acting pawn occupies.
func AttachToBlock(s *domain.GameState, gd *domain.GameData, playerID, cardID, actorPawnID string, coord domain.Coord) error {
	player := s.PlayerByID(playerID)
	if player == nil {
		return fmt.Errorf("unknown player %q", playerID)
	}
	if !cardInHand(player, cardID) {
		return fmt.Errorf("card %q is not in %s's hand", cardID, playerID)
	}
	card := cardByID(gd, cardID)
	if card == nil || card.Attach == nil || card.Attach.As != "block" {
		return fmt.Errorf("card %q is not a block attachment", cardID)
	}
	if err := requireOwnedActor(s, playerID, actorPawnID); err != nil {
		return err
	}
	actor := s.Cybernet.PawnByID(actorPawnID)
	if actor.Coord != coord {
		return fmt.Errorf("acting pawn is not on the target block")
	}
	pb := s.Cybernet.At(coord)
	if pb == nil {
		return fmt.Errorf("no block at %v", coord)
	}
	def, ok := gd.BlockByID(pb.BlockID)
	if !ok {
		return fmt.Errorf("unknown block %q", pb.BlockID)
	}
	if len(IceFaces(def.IceValue)) == 0 {
		return fmt.Errorf("cannot attach to block %q: it has no ICE value", pb.BlockID)
	}
	paid, err := payAttachCost(player, card.Attach)
	if err != nil {
		return err
	}
	if err := removeCardFromHand(player, card.ID); err != nil {
		player.BonusCounters += paid
		return err
	}
	pb.Attachments = append(pb.Attachments, domain.Attachment{CardID: card.ID, Slot: card.Attach.Slot, BonusPaid: paid})
	return nil
}

// hasSlot reports whether a pawn definition exposes the given slot type.
func hasSlot(p *domain.Pawn, slot string) bool {
	for _, s := range p.Slots {
		if s == slot {
			return true
		}
	}
	return false
}

// EffectivePawnClasses returns the pawn's base classes plus any granted by
// attached cards (deduplicated, base order first).
func EffectivePawnClasses(gd *domain.GameData, pob *domain.PawnOnBoard) []string {
	seen := map[string]bool{}
	var out []string
	add := func(c string) {
		if c != "" && !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	if def, ok := gd.PawnByID(pob.PawnID); ok {
		for _, c := range def.Class {
			add(c)
		}
	}
	for _, a := range pob.Attachments {
		if card := cardByID(gd, a.CardID); card != nil && card.Attach != nil {
			for _, c := range card.Attach.Class {
				add(c)
			}
		}
	}
	return out
}
