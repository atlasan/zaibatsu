package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func HasLimitedAttachmentUses(card *domain.ActionCard) bool {
	if card.Attach == nil {
		return false
	}
	if card.Attach.Delete != nil && card.Attach.Delete.Activation == "once-per-turn" {
		return true
	}
	for _, use := range card.Attach.AbilityUses {
		if use.Activation == "once-per-turn" || use.PerTurn > 0 || use.Dice != "" {
			return true
		}
	}
	return false
}

func readUseMarkers(markers []domain.UseMarker, ability string) int {
	for _, m := range markers {
		if m.Ability == ability {
			return m.Uses
		}
	}
	return 0
}
func spendUseMarker(markers *[]domain.UseMarker, ability string) {
	for i := range *markers {
		if (*markers)[i].Ability == ability {
			(*markers)[i].Uses++
			return
		}
	}
	*markers = append(*markers, domain.UseMarker{Ability: ability, Uses: 1})
}
func nativeUseCount(s *domain.GameState, pawnID, ability string) int {
	for _, m := range s.NativeUseMarkers {
		if m.PawnID == pawnID && m.Ability == ability {
			return m.Uses
		}
	}
	return 0
}
func spendNativeUse(s *domain.GameState, pawnID, ability string) {
	for i := range s.NativeUseMarkers {
		if s.NativeUseMarkers[i].PawnID == pawnID && s.NativeUseMarkers[i].Ability == ability {
			s.NativeUseMarkers[i].Uses++
			return
		}
	}
	s.NativeUseMarkers = append(s.NativeUseMarkers, domain.NativeUseMarker{PawnID: pawnID, Ability: ability, Uses: 1})
}
func NewAttachmentInstance(s *domain.GameState) string {
	existing := map[string]bool{}
	for _, p := range s.Cybernet.Pawns {
		for _, a := range p.Attachments {
			existing[a.InstanceID] = true
		}
	}
	for _, b := range s.Cybernet.Blocks {
		for _, a := range b.Attachments {
			existing[a.InstanceID] = true
		}
	}
	for _, a := range s.UnresolvedUseCards {
		existing[a.InstanceID] = true
	}
	for {
		s.AttachmentSerial++
		id := fmt.Sprintf("attachment-%d", s.AttachmentSerial)
		if !existing[id] {
			return id
		}
	}
}
func ensureAttachmentInstance(s *domain.GameState, att *domain.Attachment) {
	if att.InstanceID == "" {
		att.InstanceID = NewAttachmentInstance(s)
	}
}
func freeAbilityProvider(s *domain.GameState, gd *domain.GameData, pawnID, ability string) *domain.Attachment {
	pawn, _ := gd.PawnByID(pawnID)
	if pawn != nil {
		for _, a := range pawn.Abilities {
			if a.Ability == ability && a.Activation == "once-per-turn" {
				return nil
			}
		}
	}
	if placed := s.Cybernet.PawnByID(pawnID); placed != nil {
		for i := range placed.Attachments {
			att := &placed.Attachments[i]
			card := cardByID(gd, att.CardID)
			if ability != "delete" || card == nil || card.Attach == nil {
				continue
			}
			if card.Attach.Delete != nil && card.Attach.Delete.Activation == "once-per-turn" {
				return att
			}
			for _, use := range card.Attach.AbilityUses {
				if use.Ability == "delete" && use.Activation == "once-per-turn" {
					return att
				}
			}
		}
	}
	panic("the physical free-ability source is unavailable")
}
func AbilityUseSpent(s *domain.GameState, gd *domain.GameData, owner *domain.Player, pawnID, ability string) bool {
	if s.RulesVersion == "" {
		return owner.OncePerTurnUsed[abilityUsedKey(ability, pawnID)]
	}
	att := freeAbilityProvider(s, gd, pawnID, ability)
	if att != nil {
		return readUseMarkers(att.UseMarkers, ability) > 0
	}
	return nativeUseCount(s, pawnID, ability) > 0
}
func SpendAbilityUse(s *domain.GameState, gd *domain.GameData, owner *domain.Player, pawnID, ability string) {
	if s.RulesVersion == "" {
		owner.OncePerTurnUsed[abilityUsedKey(ability, pawnID)] = true
		return
	}
	att := freeAbilityProvider(s, gd, pawnID, ability)
	if att != nil {
		ensureAttachmentInstance(s, att)
		spendUseMarker(&att.UseMarkers, ability)
	} else {
		spendNativeUse(s, pawnID, ability)
	}
}
func MovementUsesTaken(s *domain.GameState, pawnID string, attachmentIndex *int, grantIndex int) int {
	if attachmentIndex == nil {
		return nativeUseCount(s, pawnID, "move")
	}
	pawn := s.Cybernet.PawnByID(pawnID)
	if pawn == nil || *attachmentIndex < 0 || *attachmentIndex >= len(pawn.Attachments) {
		panic("the physical movement card is unavailable")
	}
	return readUseMarkers(pawn.Attachments[*attachmentIndex].UseMarkers, fmt.Sprintf("move:%d", grantIndex))
}
func SpendMovementUse(s *domain.GameState, pawnID string, attachmentIndex *int, grantIndex int) {
	if attachmentIndex == nil {
		spendNativeUse(s, pawnID, "move")
		return
	}
	pawn := s.Cybernet.PawnByID(pawnID)
	if pawn == nil || *attachmentIndex < 0 || *attachmentIndex >= len(pawn.Attachments) {
		panic("the physical movement card is unavailable")
	}
	att := &pawn.Attachments[*attachmentIndex]
	ensureAttachmentInstance(s, att)
	spendUseMarker(&att.UseMarkers, fmt.Sprintf("move:%d", grantIndex))
}

// Keep the unresolved discarded-card evidence rather than adopting an unsourced reset.
func RetainDiscardedUseCards(s *domain.GameState, atts []domain.Attachment) {
	if s.RulesVersion == "" {
		return
	}
	for i := range atts {
		att := &atts[i]
		if len(att.UseMarkers) == 0 {
			continue
		}
		ensureAttachmentInstance(s, att)
		copy := *att
		copy.UseMarkers = append([]domain.UseMarker{}, att.UseMarkers...)
		s.UnresolvedUseCards = append(s.UnresolvedUseCards, copy)
	}
}
func RequireResolvedCardReuse(s *domain.GameState, cardID string) error {
	if s.RulesVersion != "" {
		for _, a := range s.UnresolvedUseCards {
			if a.CardID == cardID {
				return fmt.Errorf("discarded-card use-marker lifetime or physical-copy identity is unresolved; reattachment is not supported")
			}
		}
	}
	return nil
}
func markerPawnOwner(s *domain.GameState, pawnID string) string {
	for _, card := range s.ControlCards {
		if card.Subject.Kind == "pawn" && card.Subject.ID == pawnID {
			return card.OwnerID
		}
	}
	if p := s.Cybernet.PawnByID(pawnID); p != nil {
		return p.OwnerID
	}
	return ""
}
func ClearControlledUseMarkers(s *domain.GameState, playerID string) {
	if s.RulesVersion == "" {
		return
	}
	kept := []domain.NativeUseMarker{}
	for _, m := range s.NativeUseMarkers {
		if markerPawnOwner(s, m.PawnID) != playerID {
			kept = append(kept, m)
		}
	}
	s.NativeUseMarkers = kept
	for _, pawn := range s.Cybernet.Pawns {
		if pawn.OwnerID == playerID {
			for i := range pawn.Attachments {
				pawn.Attachments[i].UseMarkers = nil
			}
		}
	}
}

type UseMarkerAllocation struct {
	ID         string `json:"id"`
	PawnID     string `json:"pawnId"`
	Ability    string `json:"ability"`
	Uses       int    `json:"uses"`
	OwnerID    string `json:"ownerId"`
	CardID     string `json:"cardId,omitempty"`
	InstanceID string `json:"instanceId,omitempty"`
	Unresolved bool   `json:"unresolved,omitempty"`
}

func UseMarkerAllocations(s *domain.GameState) []UseMarkerAllocation {
	out := []UseMarkerAllocation{}
	for _, m := range s.NativeUseMarkers {
		out = append(out, UseMarkerAllocation{ID: "pawn:" + m.PawnID + ":" + m.Ability, PawnID: m.PawnID, Ability: m.Ability, Uses: m.Uses, OwnerID: markerPawnOwner(s, m.PawnID)})
	}
	add := func(att domain.Attachment, pawnID, ownerID string, unresolved bool) {
		for _, m := range att.UseMarkers {
			id := att.InstanceID
			if id == "" {
				id = "unidentified"
			}
			out = append(out, UseMarkerAllocation{ID: id + ":" + m.Ability, PawnID: pawnID, Ability: m.Ability, Uses: m.Uses, OwnerID: ownerID, CardID: att.CardID, InstanceID: att.InstanceID, Unresolved: unresolved})
		}
	}
	for _, p := range s.Cybernet.Pawns {
		for _, a := range p.Attachments {
			add(a, p.PawnID, p.OwnerID, false)
		}
	}
	for _, a := range s.UnresolvedUseCards {
		add(a, "", "", true)
	}
	return out
}

func UseMarkerEvents(s *domain.GameState, before []UseMarkerAllocation) []EngineEvent {
	now := UseMarkerAllocations(s)
	events := []EngineEvent{}
	find := func(markers []UseMarkerAllocation, id string) (UseMarkerAllocation, bool) {
		for _, m := range markers {
			if m.ID == id {
				return m, true
			}
		}
		return UseMarkerAllocation{}, false
	}
	emit := func(kind EventType, m UseMarkerAllocation) {
		events = append(events, EngineEvent{Type: kind, PlayerID: m.OwnerID, PawnID: m.PawnID, ElementID: m.ID, CardID: m.CardID})
	}
	for _, m := range now {
		old, _ := find(before, m.ID)
		for i := old.Uses; i < m.Uses; i++ {
			emit("ability-use-marked", m)
		}
		if m.Unresolved && !old.Unresolved {
			emit("ability-marker-retained", m)
		}
	}
	for _, old := range before {
		current, _ := find(now, old.ID)
		for i := current.Uses; i < old.Uses; i++ {
			emit("ability-use-cleared", old)
		}
	}
	return events
}
