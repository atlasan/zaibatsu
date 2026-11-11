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
// PARTIAL RUNTIME RESOLUTION: ability grants/removals, granted slots, recycle
// draw/hand modifiers, ICE-face / ICE-dice / Black-ICE modifiers, and
// attachment-granted movement activation are now wired. Armor-style defense
// replacement, own-class/target eligibility and provider-slot cascades execute.
// Broader non-move activation semantics remain later work.

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
	RetainDiscardedUseCards(s, pob.Attachments)
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
func AttachToPawn(s *domain.GameState, gd *domain.GameData, playerID, cardID, targetPawnID string, slotRefs ...string) error {
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
	return attachToPawnElement(s, gd, player, card, tgt, slotRefs...)
}

// AttachToEnemy attaches an `enemy` card to an opponent's pawn co-located with an
// acting pawn the player controls.
func AttachToEnemy(s *domain.GameState, gd *domain.GameData, playerID, cardID, actorPawnID, targetPawnID string, slotRefs ...string) error {
	slotRef := ""
	if len(slotRefs) > 0 {
		slotRef = slotRefs[0]
	}
	return attachToEnemyWithEvents(s, gd, playerID, cardID, actorPawnID, targetPawnID, slotRef, nil)
}
func attachToEnemyWithEvents(s *domain.GameState, gd *domain.GameData, playerID, cardID, actorPawnID, targetPawnID, slotRef string, events *[]EngineEvent) error {
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
	if gd.RegressionFixture != "provisional-v1" && s.PlayerByID(tgt.OwnerID) == nil {
		return fmt.Errorf("enemy attachments require another player's controlled pawn")
	}
	if actor.Coord != tgt.Coord {
		return fmt.Errorf("acting pawn and target are not in the same block")
	}
	return attachToPawnElementWithEvents(s, gd, player, card, tgt, slotRef, events)
}

// attachToPawnElement performs the slot + cost checks and attaches to a pawn.
func attachToPawnElement(s *domain.GameState, gd *domain.GameData, player *domain.Player, card *domain.ActionCard, tgt *domain.PawnOnBoard, slotRefs ...string) error {
	slotRef := ""
	if len(slotRefs) > 0 {
		slotRef = slotRefs[0]
	}
	return attachToPawnElementWithEvents(s, gd, player, card, tgt, slotRef, nil)
}
func attachToPawnElementWithEvents(s *domain.GameState, gd *domain.GameData, player *domain.Player, card *domain.ActionCard, tgt *domain.PawnOnBoard, slotRef string, events *[]EngineEvent) error {
	if err := RequireResolvedCardReuse(s, card.ID); err != nil {
		return err
	}
	if err := ValidateAttachmentRules(card); err != nil {
		return err
	}
	slot := card.Attach.Slot
	if slot == "" {
		return fmt.Errorf("card %q has no slot to attach into", card.ID)
	}
	if _, ok := gd.PawnByID(tgt.PawnID); !ok {
		return fmt.Errorf("unknown pawn %q", tgt.PawnID)
	}
	if gd.RegressionFixture != "provisional-v1" {
		classes := EffectivePawnClasses(gd, tgt)
		for _, class := range card.Attach.ForbiddenClasses {
			if containsString(classes, class) {
				return fmt.Errorf("card %q forbids the target pawn's class", card.ID)
			}
		}
		if len(card.Attach.Class) > 0 {
			matches := false
			for _, class := range card.Attach.Class {
				matches = matches || containsString(classes, class)
			}
			if !matches {
				return fmt.Errorf("card %q requires a matching target class", card.ID)
			}
		}
	}
	if !containsString(EffectivePawnSlots(gd, tgt), slot) {
		return fmt.Errorf("pawn %q has no %s slot", tgt.PawnID, slot)
	}
	selected := ""
	if gd.RegressionFixture == "provisional-v1" {
		if slotRef != "" {
			return fmt.Errorf("physical slot references require the source engine")
		}
		if tgt.HasSlotFilled(slot) {
			return fmt.Errorf("pawn %q already has its %s slot filled", tgt.PawnID, slot)
		}
	} else {
		free := AvailableAttachmentSlots(gd, tgt, slot)
		if slotRef != "" {
			for _, location := range free {
				if location.Ref == slotRef {
					selected = slotRef
				}
			}
			if selected == "" {
				return fmt.Errorf("the selected attachment slot is unavailable")
			}
		} else {
			if len(free) == 0 {
				return fmt.Errorf("pawn %q has no empty %s slot", tgt.PawnID, slot)
			}
			if len(free) > 1 {
				return fmt.Errorf("choose a physical attachment slot")
			}
			selected = free[0].Ref
		}
	}
	if !SupportsAttachmentTiming(card) {
		return fmt.Errorf("attachment-time effects require unsupported placement/choice resolution")
	}
	paid, err := payAttachCost(player, card.Attach)
	if err != nil {
		return err
	}
	if err := removeCardFromHand(player, card.ID); err != nil {
		player.BonusCounters += paid // refund on the (unexpected) failure
		return err
	}
	att := domain.Attachment{CardID: card.ID, Slot: slot, SlotRef: selected, BonusPaid: paid}
	if s.RulesVersion != "" {
		att.InstanceID = NewAttachmentInstance(s)
	}
	tgt.Attachments = append(tgt.Attachments, att)
	for _, effect := range card.Effects {
		if effect.Trigger == "on-attach" && effect.Kind == "gain-target-control" {
			if events != nil {
				for _, att := range tgt.Attachments {
					*events = append(*events, EngineEvent{Type: "card-discarded", CardID: att.CardID})
				}
			}
			discardAttachments(s, tgt)
			if err := GainPawnControl(s, gd, tgt.PawnID, player.ID, events); err != nil {
				return err
			}
		}
	}
	return nil
}

// AttachToBlock attaches a `block` card to the block an acting pawn occupies.
func AttachToBlock(s *domain.GameState, gd *domain.GameData, playerID, cardID, actorPawnID string, coord domain.Coord) error {
	if err := RequireResolvedCardReuse(s, cardID); err != nil {
		return err
	}
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
	if gd.RegressionFixture != "provisional-v1" && (len(card.Attach.Class) > 0 || len(card.Attach.ForbiddenClasses) > 0) {
		return fmt.Errorf("target-class restrictions require a pawn or enemy attachment")
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
	for _, effect := range card.Effects {
		if effect.Trigger == "on-attach" {
			return fmt.Errorf("attachment-time effects require unsupported placement/choice resolution")
		}
	}
	paid, err := payAttachCost(player, card.Attach)
	if err != nil {
		return err
	}
	if err := removeCardFromHand(player, card.ID); err != nil {
		player.BonusCounters += paid
		return err
	}
	att := domain.Attachment{CardID: card.ID, Slot: card.Attach.Slot, BonusPaid: paid}
	if s.RulesVersion != "" {
		att.InstanceID = NewAttachmentInstance(s)
	}
	pb.Attachments = append(pb.Attachments, att)
	return nil
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func attachmentCards(gd *domain.GameData, atts []domain.Attachment) []*domain.ActionCard {
	out := make([]*domain.ActionCard, 0, len(atts))
	for _, att := range atts {
		if card := cardByID(gd, att.CardID); card != nil {
			out = append(out, card)
		}
	}
	return out
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
			for _, c := range card.Class {
				add(c)
			}
			if gd.RegressionFixture == "provisional-v1" {
				for _, c := range card.Attach.Class {
					add(c)
				}
			}
		}
	}
	return out
}

// EffectivePawnSlots returns the pawn's printed slots plus any additional slots
// granted by its attachments.
func EffectivePawnSlots(gd *domain.GameData, pob *domain.PawnOnBoard) []string {
	if gd.RegressionFixture != "provisional-v1" {
		out := []string{}
		for _, slot := range PawnAttachmentSlots(gd, pob) {
			if !containsString(out, slot.Slot) {
				out = append(out, slot.Slot)
			}
		}
		return out
	}
	seen := map[string]bool{}
	out := []string{}
	add := func(slot string) {
		if slot != "" && !seen[slot] {
			seen[slot] = true
			out = append(out, slot)
		}
	}
	if def, ok := gd.PawnByID(pob.PawnID); ok {
		for _, slot := range def.Slots {
			add(slot)
		}
	}
	for _, card := range attachmentCards(gd, pob.Attachments) {
		if card.Attach == nil {
			continue
		}
		for _, slot := range card.Attach.GrantsSlot {
			add(slot)
		}
	}
	return out
}

// PlayerAttachmentModifiers sums the player's current attachment-driven recycle
// modifiers across all controlled pawns and blocks.
func PlayerAttachmentModifiers(s *domain.GameState, gd *domain.GameData, playerID string) (drawModifier int, handModifier int) {
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.OwnerID != playerID {
			continue
		}
		for _, card := range attachmentCards(gd, pawn.Attachments) {
			if card.Attach == nil {
				continue
			}
			drawModifier += card.Attach.DrawModifier
			handModifier += card.Attach.HandModifier
		}
	}
	for _, block := range s.Cybernet.Blocks {
		if block.OwnerID != playerID {
			continue
		}
		for _, card := range attachmentCards(gd, block.Attachments) {
			if card.Attach == nil {
				continue
			}
			drawModifier += card.Attach.DrawModifier
			handModifier += card.Attach.HandModifier
		}
	}
	return drawModifier, handModifier
}

func EffectiveDefenseDice(gd *domain.GameData, pob *domain.PawnOnBoard) []domain.DefenseDie {
	base := []domain.DefenseDie{}
	if def, ok := gd.PawnByID(pob.PawnID); ok {
		base = append(base, def.Defense...)
	}
	for _, card := range attachmentCards(gd, pob.Attachments) {
		if card.Attach != nil && len(card.Attach.DefenseOverride) > 0 {
			base = card.Attach.DefenseOverride
		}
	}
	return append([]domain.DefenseDie{}, base...)
}

func TargetIceNullified(gd *domain.GameData, atts []domain.Attachment) bool {
	for _, card := range attachmentCards(gd, atts) {
		if card.Attach != nil && card.Attach.NullifiesIce {
			return true
		}
	}
	return false
}
