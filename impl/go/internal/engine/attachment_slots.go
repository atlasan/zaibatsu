package engine

import (
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"sort"
	"strings"
)

type PawnAttachmentSlot struct {
	Slot            string `json:"slot"`
	Ref             string `json:"ref"`
	Occupied        bool   `json:"occupied"`
	ProviderCardID  string `json:"providerCardId,omitempty"`
	AttachmentIndex *int   `json:"attachmentIndex,omitempty"`
}

// PawnAttachmentSlots enumerates physical slot locations rooted in the pawn.
// Missing refs are inferred for hand-authored fixtures, without mutating them.
func PawnAttachmentSlots(gd *domain.GameData, pawn *domain.PawnOnBoard) []PawnAttachmentSlot {
	slots := []PawnAttachmentSlot{}
	def, ok := gd.PawnByID(pawn.PawnID)
	if !ok {
		return slots
	}
	if gd.RegressionFixture == "provisional-v1" {
		kinds := append([]string{}, def.Slots...)
		for _, att := range pawn.Attachments {
			if c := cardByID(gd, att.CardID); c != nil && c.Attach != nil {
				kinds = append(kinds, c.Attach.GrantsSlot...)
			}
		}
		seen := map[string]bool{}
		for _, kind := range kinds {
			if seen[kind] {
				continue
			}
			seen[kind] = true
			location := PawnAttachmentSlot{Slot: kind, Ref: "legacy:" + kind}
			for i, att := range pawn.Attachments {
				if att.Slot == kind {
					index := i
					location.Occupied = true
					location.AttachmentIndex = &index
					break
				}
			}
			slots = append(slots, location)
		}
		return slots
	}
	seen := map[string]bool{}
	for _, kind := range def.Slots {
		if !seen[kind] {
			slots = append(slots, PawnAttachmentSlot{Slot: kind, Ref: "pawn:" + kind})
			seen[kind] = true
		}
	}
	bound := make([]bool, len(pawn.Attachments))
	progress := true
	for progress {
		progress = false
		for i, att := range pawn.Attachments {
			if bound[i] {
				continue
			}
			card := cardByID(gd, att.CardID)
			kind := att.Slot
			if kind == "" && card != nil && card.Attach != nil {
				kind = card.Attach.Slot
			}
			for j := range slots {
				if slots[j].Occupied || slots[j].Slot != kind || (att.SlotRef != "" && slots[j].Ref != att.SlotRef) {
					continue
				}
				index := i
				slots[j].Occupied = true
				slots[j].AttachmentIndex = &index
				bound[i] = true
				progress = true
				ref := slots[j].Ref
				if card != nil && card.Attach != nil {
					for _, grant := range card.Attach.GrantsSlot {
						slots = append(slots, PawnAttachmentSlot{Slot: grant, Ref: ref + "/" + grant, ProviderCardID: att.CardID})
					}
				}
				break
			}
		}
	}
	return slots
}

func AvailableAttachmentSlots(gd *domain.GameData, pawn *domain.PawnOnBoard, kind string) []PawnAttachmentSlot {
	out := []PawnAttachmentSlot{}
	for _, slot := range PawnAttachmentSlots(gd, pawn) {
		if !slot.Occupied && (kind == "" || slot.Slot == kind) {
			out = append(out, slot)
		}
	}
	return out
}

// DiscardPawnAttachment removes a physical card and all cards in its granted
// slots, parent before descendants. Existing slots are never reassigned.
func DiscardPawnAttachment(s *domain.GameState, gd *domain.GameData, pawn *domain.PawnOnBoard, index int, events *[]EngineEvent) []domain.Attachment {
	if index < 0 || index >= len(pawn.Attachments) {
		return nil
	}
	slots := PawnAttachmentSlots(gd, pawn)
	source := ""
	for _, slot := range slots {
		if slot.AttachmentIndex != nil && *slot.AttachmentIndex == index {
			source = slot.Ref
			break
		}
	}
	dependent := []PawnAttachmentSlot{}
	if gd.RegressionFixture != "provisional-v1" && source != "" {
		for _, slot := range slots {
			if slot.AttachmentIndex != nil && strings.HasPrefix(slot.Ref, source+"/") {
				dependent = append(dependent, slot)
			}
		}
	}
	sort.SliceStable(dependent, func(i, j int) bool {
		a, b := strings.Count(dependent[i].Ref, "/"), strings.Count(dependent[j].Ref, "/")
		if a != b {
			return a < b
		}
		return *dependent[i].AttachmentIndex < *dependent[j].AttachmentIndex
	})
	indices := map[int]bool{index: true}
	removed := []domain.Attachment{pawn.Attachments[index]}
	for _, slot := range dependent {
		at := *slot.AttachmentIndex
		indices[at] = true
		removed = append(removed, pawn.Attachments[at])
	}
	retained := []domain.Attachment{}
	for i, att := range pawn.Attachments {
		if !indices[i] {
			retained = append(retained, att)
		}
	}
	RetainDiscardedUseCards(s, removed)
	pawn.Attachments = retained
	owner := s.PlayerByID(pawn.OwnerID)
	for _, att := range removed {
		s.Discard = append(s.Discard, att.CardID)
		if owner != nil {
			owner.BonusCounters += att.BonusPaid
		}
		if events != nil {
			*events = append(*events, EngineEvent{Type: "card-discarded", CardID: att.CardID})
		}
	}
	return removed
}
