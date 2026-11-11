package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestAttachmentRestrictionRejectsBlockDefinitions(t *testing.T) {
	for _, required := range []bool{true, false} {
		gd, s, actor, _, _ := restrictionGame(t, "fixture-invalid-block")
		attach := &domain.Attach{As: "block"}
		if required {
			attach.Class = []string{"cleaner"}
		} else {
			attach.ForbiddenClasses = []string{"operative"}
		}
		gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-invalid-block", Name: "Invalid block restriction", Attach: attach})
		if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil || !strings.Contains(err.Error(), "target-class restrictions require a pawn or enemy") {
			t.Fatal(err)
		}
		restrictionReject(t, s, gd, Action{Type: ActAttachBlock, PawnID: actor, CardID: "fixture-invalid-block", Coord: &domain.Coord{}})
		for _, o := range AvailableActions(s, gd) {
			if o.Action.Type == ActAttachBlock && o.Action.CardID == "fixture-invalid-block" {
				t.Fatal("invalid block option")
			}
		}
	}
}

func restrictionGame(t *testing.T, cardID string) (*domain.GameData, *domain.GameState, string, string, *domain.Pawn) {
	t.Helper()
	gd, s, actor := classGame(t)
	target := s.Players[1].PawnID
	def, _ := gd.PawnByID(target)
	// Synthetic attributes exercise printed cards, without promoting a pawn record.
	def.Class = []string{"fixture-subject"}
	def.Abilities = append(def.Abilities, domain.Ability{Ability: "delete", Activation: "card", Skulls: 1})
	def.Movement = domain.Movement{Type: "steps", Steps: 2, Activation: "once-per-turn"}
	def.IceFaces = []int{1, 2, 3, 4, 5, 6}
	gd.Blocks[0].Spaces = []domain.Space{{ID: "a", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"b"}}, {ID: "b", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"a"}}}
	for i := range s.Cybernet.Pawns {
		s.Cybernet.Pawns[i].SpaceID = "a"
	}
	s.Players[0].Hand = []string{cardID}
	s.Players[1].Hand = []string{"dummy", "dj", "dj", "dj", "dj"}
	s.Deck = []string{"dj", "dj", "dj", "dj", "dj"}
	return gd, s, actor, target, def
}
func restrictionReject(t *testing.T, s *domain.GameState, gd *domain.GameData, a Action) {
	t.Helper()
	before := Snapshot(s)
	rng := *s.RNG
	if r := ApplyWithEvents(s, gd, a); r.Accepted || Snapshot(s) != before {
		t.Fatal("rejected attachment changed state", r)
	}
	after := *s.RNG
	if after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("rejection changed RNG")
	}
}
func TestAttachmentRestrictionBilingualRecords(t *testing.T) {
	for _, id := range []string{"worm", "under-clocker", "hijacker"} {
		gd, _, _, _, _ := restrictionGame(t, id)
		c := cardByID(gd, id)
		if c.Type != "add-on" || !slices.Equal(c.Class, []string{"malware"}) || c.Copies != 1 || c.Movement != 1 || !slices.Equal(c.Activates, []string{"icebreaker"}) || c.Provisional || !slices.Equal(c.Attach.ForbiddenClasses, []string{"operative"}) || c.Attach.Cost != 0 {
			t.Fatal(c)
		}
	}
}
func TestAttachmentRestrictionNativeAndGainedOperative(t *testing.T) {
	for _, id := range []string{"worm", "under-clocker", "hijacker"} {
		for _, gained := range []bool{false, true} {
			gd, s, actor, target, def := restrictionGame(t, id)
			if gained {
				gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-class", Name: "Synthetic class grant", Class: []string{"operative"}, Attach: &domain.Attach{As: "pawn", Slot: "gadget"}})
				s.Cybernet.PawnByID(target).Attachments = []domain.Attachment{{CardID: "fixture-class", Slot: "gadget"}}
			} else {
				def.Class = []string{"operative"}
			}
			before := Snapshot(s)
			rng := *s.RNG
			for _, o := range AvailableActions(s, gd) {
				if o.Action.Type == ActAttachEnemy && o.Action.CardID == id {
					t.Fatal("forbidden option offered")
				}
			}
			after := *s.RNG
			if Snapshot(s) != before || after.Intn(100000) != rng.Intn(100000) {
				t.Fatal("query mutation")
			}
			restrictionReject(t, s, gd, Action{Type: ActAttachEnemy, PawnID: actor, TargetID: target, CardID: id})
		}
	}
}
func TestAttachmentRestrictionAnyRequiredMatchAndExclusionPrecedence(t *testing.T) {
	gd, s, _, target, _ := restrictionGame(t, "fixture-restricted")
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-restricted", Name: "Synthetic restricted card", Class: []string{"cleaner"}, Attach: &domain.Attach{As: "pawn", Slot: "add-on", Class: []string{"cleaner", "bot"}, ForbiddenClasses: []string{"operative"}, Cost: 1}})
	s.Players[0].BonusCounters = 1
	s.Cybernet.PawnByID(target).OwnerID = "p1"
	restrictionReject(t, s, gd, Action{Type: ActAttachPawn, CardID: "fixture-restricted", TargetID: target})
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-class", Name: "Synthetic Bot grant", Class: []string{"bot", "operative"}, Attach: &domain.Attach{As: "pawn", Slot: "gadget"}})
	s.Cybernet.PawnByID(target).Attachments = []domain.Attachment{{CardID: "fixture-class", Slot: "gadget"}}
	restrictionReject(t, s, gd, Action{Type: ActAttachPawn, CardID: "fixture-restricted", TargetID: target})
	cardByID(gd, "fixture-class").Class = []string{"bot"}
	r := ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: "fixture-restricted", TargetID: target})
	if !r.Accepted || s.Players[0].BonusCounters != 0 || !slices.Equal(EffectivePawnClasses(gd, s.Cybernet.PawnByID(target)), []string{"fixture-subject", "bot", "cleaner"}) {
		t.Fatal(r)
	}
}
func TestAttachmentRestrictionPenaltiesCleanupAndSharedEvidence(t *testing.T) {
	type evidence struct {
		CardID   string          `json:"cardId"`
		Attached json.RawMessage `json:"attached"`
		After    json.RawMessage `json:"after"`
		Events   []EngineEvent   `json:"events"`
	}
	rows := []evidence{}
	for _, id := range []string{"worm", "under-clocker", "hijacker"} {
		gd, s, actor, target, def := restrictionGame(t, id)
		offered := false
		for _, o := range AvailableActions(s, gd) {
			offered = offered || (o.Action.Type == ActAttachEnemy && o.Action.CardID == id && o.Action.TargetID == target)
		}
		if !offered {
			t.Fatal("legal option absent", id)
		}
		attached := ApplyWithEvents(s, gd, Action{Type: ActAttachEnemy, PawnID: actor, TargetID: target, CardID: id})
		if !attached.Accepted {
			t.Fatal(attached)
		}
		attachedSnapshot := Snapshot(s)
		events := append([]EngineEvent{}, attached.Events...)
		pob := s.Cybernet.PawnByID(target)
		if !slices.Equal(EffectivePawnClasses(gd, pob), []string{"fixture-subject", "malware"}) {
			t.Fatal("class grant")
		}
		_, handModifier := PlayerAttachmentModifiers(s, gd, "p2")
		wantHand := 0
		if id == "worm" {
			wantHand = -1
		}
		if handModifier != wantHand || (effectiveAbility(gd, def, pob.Attachments, "delete") != nil) != (id != "under-clocker") || (len(EffectiveMovementOptions(gd, def, pob.Attachments)) > 0) != (id != "hijacker") {
			t.Fatal("penalty mismatch", id)
		}
		s.CurrentPlayer = 1
		if id == "under-clocker" {
			restrictionReject(t, s, gd, Action{Type: ActPlayDelete, PawnID: target, TargetID: actor, CardID: "dummy"})
		}
		if id == "hijacker" {
			restrictionReject(t, s, gd, Action{Type: ActMoveSteps, PawnID: target, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}})
			restrictionReject(t, s, gd, Action{Type: ActPlayMove, PawnID: target, CardID: "dummy", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}})
		}
		if id == "worm" {
			phase := AdvancePhase(s, gd)
			if !phase.Accepted {
				t.Fatal(phase)
			}
			events = append(events, phase.Events...)
			recycle := ApplyWithEvents(s, gd, Action{Type: ActRecycle, CardIDs: []string{"dj"}})
			if !recycle.Accepted || len(s.Players[1].Hand) != 4 {
				t.Fatal(recycle)
			}
			events = append(events, recycle.Events...)
			s.Phase = domain.PhaseAction
		}
		s.CurrentPlayer = 0
		s.Players[0].Hand = []string{"dj"}
		taken := ApplyWithEvents(s, gd, Action{Type: ActPlayIcebreakPawn, PawnID: actor, TargetID: target, CardID: "dj"})
		if !taken.Accepted {
			t.Fatal(taken)
		}
		pob = s.Cybernet.PawnByID(target)
		_, handAfter := PlayerAttachmentModifiers(s, gd, "p1")
		if !slices.Equal(EffectivePawnClasses(gd, pob), []string{"fixture-subject"}) || handAfter != 0 || effectiveAbility(gd, def, pob.Attachments, "delete") == nil || len(EffectiveMovementOptions(gd, def, pob.Attachments)) != 1 {
			t.Fatal("cleanup mismatch", id)
		}
		rows = append(rows, evidence{CardID: id, Attached: json.RawMessage(attachedSnapshot), After: json.RawMessage(Snapshot(s)), Events: append(events, taken.Events...)})
		sg, ss, sa, _, sd := restrictionGame(t, id)
		sd.Class = []string{"operative"}
		sg.Blocks[0].IceValue = domain.IceHigh
		sg.Blocks[0].IceFaces = []int{1, 2, 3, 4, 5, 6}
		strip := ApplyWithEvents(ss, sg, Action{Type: ActPlayIcebreakBlk, PawnID: sa, CardID: id, Coord: &domain.Coord{}})
		if !strip.Accepted || !slices.Equal(ss.PlayedCards, []string{id}) || len(ss.Cybernet.PawnByID(sa).Attachments) != 0 {
			t.Fatal("strip applied attachment", strip)
		}
	}
	actual, _ := json.Marshal(rows)
	var want, got any
	if json.Unmarshal([]byte(readGolden(t, "attachment-restrictions.json")), &want) != nil || json.Unmarshal(actual, &got) != nil || !reflect.DeepEqual(want, got) {
		t.Fatal("restriction golden mismatch", string(actual))
	}
}
func TestAttachmentRestrictionLegacyBoundary(t *testing.T) {
	gd, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	pob := &domain.PawnOnBoard{PawnID: gd.Pawns[0].ID, OwnerID: "p1", SpaceID: "core", Attachments: []domain.Attachment{{CardID: "add-on-accelerator", Slot: "add-on"}}}
	if !slices.Contains(EffectivePawnClasses(gd, pob), "accelerator") {
		t.Fatal("legacy grant lost")
	}
	gd, s, _, target, _ := restrictionGame(t, "fixture-target-rule")
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "fixture-target-rule", Name: "Restriction without own class", Attach: &domain.Attach{As: "pawn", Slot: "gadget", Class: []string{"fixture-subject"}}})
	s.Cybernet.PawnByID(target).Attachments = []domain.Attachment{{CardID: "fixture-target-rule", Slot: "gadget"}}
	if !slices.Equal(EffectivePawnClasses(gd, s.Cybernet.PawnByID(target)), []string{"fixture-subject"}) {
		t.Fatal("restriction became grant")
	}
}
