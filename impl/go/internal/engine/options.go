package engine

import "github.com/zaibatsu/zaibatsu-go/internal/domain"

// AvailableAction is an engine-owned template; the caller completes paths or assignments.
type AvailableAction struct {
	UnresolvedTargets []UnresolvedSacrificeTarget `json:"unresolvedTargets,omitempty"`
	Responses         []Action                    `json:"responses,omitempty"`
	Action            Action                      `json:"action"`
	Movement          *domain.Movement            `json:"movement,omitempty"`
	Targets           []SpaceRef                  `json:"targets,omitempty"`
	MaxSteps          int                         `json:"maxSteps,omitempty"`
	Directions        []int                       `json:"directions,omitempty"`
}

// AvailableActions does not mutate state or advance the live RNG.
func AvailableActions(s *domain.GameState, gd *domain.GameData, viewerIDs ...string) []AvailableAction {
	out := []AvailableAction{}
	if s.WinnerID != "" {
		return out
	}
	id := s.CurrentPlayerPtr().ID
	if len(viewerIDs) > 0 && viewerIDs[0] != "" {
		id = viewerIDs[0]
	}
	if s.PendingChoice == nil && s.PendingAttack == nil && s.PendingThreats == nil && s.PendingPhase == "" && gd.RegressionFixture != "provisional-v1" && (s.Phase != domain.PhaseAction || id != s.CurrentPlayerPtr().ID) {
		if s.Phase == domain.PhaseRecycle && id == s.CurrentPlayerPtr().ID {
			out = append(out, AvailableAction{Action: Action{Type: ActRecycle}})
		}
		return append(out, outsideTurnOptions(s, gd, id)...)
	}
	if len(viewerIDs) > 0 && viewerIDs[0] != "" && s.PendingBlockSacrifices == nil && s.PendingBlockDiscards == nil {
		authorized := s.CurrentPlayerPtr().ID
		if s.PendingChoice != nil {
			authorized = s.PendingChoice.PlayerID
		} else if s.PendingAttack != nil {
			authorized = s.PendingAttack.PlayerID
		}
		if viewerIDs[0] != authorized {
			return out
		}
	}
	if s.PendingBlockSacrifices != nil {
		id := ""
		if s.PendingChoice != nil {
			id = s.PendingChoice.PlayerID
		}
		if len(viewerIDs) > 0 {
			id = viewerIDs[0]
		}
		for _, d := range s.PendingBlockSacrifices.Decisions {
			if d.PlayerID == id && !d.Submitted {
				responses, unresolved := BlockSacrificeOptions(s, gd, d.ID)
				return []AvailableAction{{Action: Action{Type: ActResolveChoice, PlayerID: d.PlayerID, ChoiceID: d.ID, OptionID: "sacrifice"}, Responses: responses, UnresolvedTargets: unresolved}}
			}
		}
		return out
	}
	if s.PendingBlockDiscards != nil {
		id := ""
		if s.PendingChoice != nil {
			id = s.PendingChoice.PlayerID
		}
		if len(viewerIDs) > 0 {
			id = viewerIDs[0]
		}
		for _, d := range s.PendingBlockDiscards.Decisions {
			if d.PlayerID == id && !d.Submitted {
				return []AvailableAction{{Action: Action{Type: ActResolveChoice, PlayerID: d.PlayerID, ChoiceID: d.ID, OptionID: "discard"}}}
			}
		}
		return out
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "block-detach" {
		return []AvailableAction{{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID}, Responses: BlockDetachResponses(s, gd)}}
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "block-attack" {
		return []AvailableAction{{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID}, Responses: BlockAttackResponses(s, gd)}}
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "steal-card" {
		return []AvailableAction{{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID}, Responses: PawnTheftResponses(s, gd)}}
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "space-discard" {
		responses, err := SpaceEffectResponses(s, gd)
		if err != nil {
			return out
		}
		return []AvailableAction{{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID}, Responses: responses}}
	}
	if s.PendingChoice != nil && s.PendingChoice.Kind == "move-path" {
		preview, err := MovementChoicePreview(s, gd, nil)
		if err != nil {
			return out
		}
		option := AvailableAction{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID, OptionID: "move"}, Targets: preview.NextTargets, MaxSteps: preview.Budget}
		if preview.CanFinish {
			option.Responses = []Action{{Type: ActResolveChoice, PlayerID: s.PendingChoice.PlayerID, ChoiceID: s.PendingChoice.ID, OptionID: "move", Path: []SpaceRef{}}}
		}
		return []AvailableAction{option}
	}
	if s.PendingChoice != nil {
		option := AvailableAction{Action: Action{Type: ActResolveChoice, ChoiceID: s.PendingChoice.ID}}
		if s.PendingChoice.Kind == "place-block" {
			option.Responses = SearchPlacementResponses(s, gd)
		}
		if s.PendingChoice.Kind == "prevent-elimination" {
			option.Responses = PreventionResponses(s, gd)
		}
		if s.PendingChoice.Kind == "relocate-pawn" {
			option.Targets = PhaseChoiceTargets(s, gd)
		}
		return []AvailableAction{option}
	}
	if s.PendingAttack != nil {
		a := Action{Type: ActAssignDelete}
		if s.PendingAttack.PlayerID != s.CurrentPlayerPtr().ID {
			a.PlayerID = s.PendingAttack.PlayerID
		}
		return []AvailableAction{{Action: a}}
	}
	if s.PendingThreats != nil && s.PendingThreats.Stage == "retaliation" {
		return []AvailableAction{{Action: Action{Type: ActAssignThreatAttack}}}
	}
	if s.Phase == domain.PhaseRecycle {
		return []AvailableAction{{Action: Action{Type: ActRecycle}}}
	}
	if s.Phase != domain.PhaseAction && !(s.PendingPhase != "" && s.PendingThreats != nil) {
		return out
	}
	p := s.CurrentPlayerPtr()
	add := func(a Action) { out = append(out, AvailableAction{Action: a}) }
	probe := func(a Action) {
		if ApplyWithEvents(CloneState(s), gd, a).Accepted {
			add(a)
		}
	}
	if s.PendingThreats != nil && s.PendingThreats.Stage == "response" {
		add(Action{Type: ActAssignThreatAttack})
	}
	if s.PendingThreats == nil {
		add(Action{Type: ActPass})
	}
	hand := []string{}
	for _, id := range p.Hand {
		if !containsString(hand, id) {
			hand = append(hand, id)
		}
	}
	cardsFor := func(activation, ability string) []string {
		if activation != "card" {
			return []string{""}
		}
		cards := []string{}
		for _, id := range hand {
			c := cardByID(gd, id)
			if c != nil && (ability == "move" && c.Movement > 0 || ability != "move" && cardActivates(gd, id, ability)) {
				cards = append(cards, id)
			}
		}
		return cards
	}
	for _, placed := range s.Cybernet.Pawns {
		if placed.OwnerID != p.ID {
			continue
		}
		pawn, ok := gd.PawnByID(placed.PawnID)
		if !ok {
			continue
		}
		if s.PendingThreats == nil {
			for movementIndex, option := range EffectiveMovementOptions(gd, pawn, placed.Attachments) {
				if gd.RegressionFixture != "provisional-v1" && option.RolledPerTurn != "" {
					continue
				}
				copy := CloneState(s)
				if CanActivateMovementOption(copy, copy.CurrentPlayerPtr(), pawn.ID, option) != nil {
					continue
				}
				for _, cardID := range cardsFor(option.Movement.Activation, "move") {
					action := Action{Type: ActMoveSteps, PawnID: pawn.ID, CardID: cardID, MovementIndex: movementIndex}
					if option.Movement.Type == "hex" {
						action.Type = ActMoveHex
					} else if cardID != "" && movementIndex == 0 {
						action.Type = ActPlayMove
					}
					movement := option.Movement
					if gd.RegressionFixture != "provisional-v1" && (movement.Type == "d6" || movement.Type == "2d6") {
						action.Type = ActRollMovement
						if RolledMovementError(s, gd, action) == nil {
							m := movement
							out = append(out, AvailableAction{Action: action, Movement: &m})
						}
						continue
					}
					if movement.Type == "hex" {
						directions := []int{}
						for dir := 0; dir < 6; dir++ {
							if s.Cybernet.At(placed.Coord.Neighbor(dir)) != nil {
								a := action
								a.Dir = dir
								if ApplyWithEvents(CloneState(s), gd, a).Accepted {
									directions = append(directions, dir)
								}
							}
						}
						if len(directions) > 0 {
							out = append(out, AvailableAction{Action: action, Movement: &movement, Directions: directions})
						}
					} else {
						if cardID != "" && movementIndex == 0 {
							movement = domain.Movement{Type: "steps", Steps: cardByID(gd, cardID).Movement, Activation: "card"}
						}
						maximum := movement.Steps
						if movement.Type == "d6" {
							maximum = 6
						} else if movement.Type == "2d6" {
							maximum = 12
						}
						maximum += MovementStepModifier(gd, placed)
						if maximum < 0 {
							maximum = 0
						}
						targets := StepTargets(gd, s.Cybernet, placed.Coord, placed.SpaceID, pawn.ID)
						if gd.RegressionFixture != "provisional-v1" {
							canStop := ApplyWithEvents(CloneState(s), gd, action).Accepted
							if canStop || maximum > 0 && len(targets) > 0 {
								o := AvailableAction{Action: action, Movement: &movement, MaxSteps: maximum}
								if maximum > 0 && len(targets) > 0 {
									o.Targets = targets
								}
								if canStop {
									o.Responses = []Action{action}
								}
								out = append(out, o)
							}
						} else if maximum > 0 && len(targets) > 0 {
							out = append(out, AvailableAction{Action: action, Movement: &movement, Targets: targets, MaxSteps: maximum})
						}
					}
				}
			}
			if gd.RegressionFixture != "provisional-v1" && (pawn.Movement.Activation == "once-per-turn" || pawn.Movement.Type == "d6" || pawn.Movement.Type == "2d6") && len(EffectiveMovementOptions(gd, pawn, placed.Attachments)) > 0 {
				targets := StepTargets(gd, s.Cybernet, placed.Coord, placed.SpaceID, pawn.ID)
				for _, cardID := range hand {
					card := cardByID(gd, cardID)
					if card == nil {
						continue
					}
					maximum := card.Movement + MovementStepModifier(gd, placed)
					if maximum < 0 {
						maximum = 0
					}
					action := Action{Type: ActPlayMove, PawnID: pawn.ID, CardID: cardID}
					canStop := card.Movement > 0 && ApplyWithEvents(CloneState(s), gd, action).Accepted
					if card.Movement > 0 && (canStop || maximum > 0 && len(targets) > 0) {
						movement := domain.Movement{Type: "steps", Steps: card.Movement, Activation: "card"}
						o := AvailableAction{Action: action, Movement: &movement, MaxSteps: maximum}
						if maximum > 0 && len(targets) > 0 {
							o.Targets = targets
						}
						if canStop {
							o.Responses = []Action{action}
						}
						out = append(out, o)
					}
				}
			}
			search := effectiveAbility(gd, pawn, placed.Attachments, "search")
			if search != nil && search.Activation != "none" && !(search.Activation == "once-per-turn" && AbilityUseSpent(s, gd, p, pawn.ID, "search")) {
				if gd.RegressionFixture != "provisional-v1" {
					cards := []string{""}
					if search.Activation == "card" {
						cards = hand
					}
					for _, cardID := range cards {
						if SearchDeclarationError(s, gd, p.ID, pawn.ID, cardID) == nil {
							a := Action{Type: ActSearch, PawnID: pawn.ID, CardID: cardID}
							if cardID != "" {
								a.Type = ActPlaySearch
							}
							add(a)
						}
					}
				} else if placements, err := ValidSearchPlacements(s, gd, pawn.ID); err == nil {
					for _, placement := range placements {
						for _, cardID := range func() []string {
							if search.Activation == "card" {
								return hand
							}
							return []string{""}
						}() {
							a := Action{Type: ActSearch, PawnID: pawn.ID, CardID: cardID, Dir: placement.Dir, Rotation: placement.Rotation}
							if cardID != "" {
								a.Type = ActPlaySearch
							}
							add(a)
						}
					}
				}
			}
		}
		targets := []*domain.PawnOnBoard{}
		for _, other := range s.Cybernet.Pawns {
			if other.PawnID != pawn.ID && other.Coord == placed.Coord {
				targets = append(targets, other)
			}
		}
		threats := 0
		for _, threat := range s.Threats {
			if threat.Coord == placed.Coord && threat.Status != "eliminated" {
				threats++
			}
		}
		for _, option := range DeleteActivationOptions(gd, pawn, placed.Attachments) {
			del := &option
			if del != nil && del.Activation != "none" && !(del.Activation == "once-per-turn" && AbilityUseSpent(s, gd, p, pawn.ID, "delete")) && (len(targets) > 0 || threats > 0) {
				for _, cardID := range cardsFor(del.Activation, "delete") {
					add(Action{Type: ActRollDelete, PawnID: pawn.ID, CardID: cardID})
					if gd.RegressionFixture != "provisional-v1" && threats > 0 {
						count := 0
						for _, other := range s.Cybernet.Pawns {
							def, _ := gd.PawnByID(other.PawnID)
							if def != nil && other.OwnerID == p.ID && other.Coord == placed.Coord && PawnDeleteProfile(gd, def, other.Attachments).Skulls > 0 {
								count++
							}
						}
						if count > 1 {
							add(Action{Type: ActRollDelete, PawnID: pawn.ID, CardID: cardID, Joint: true})
						}
					}
					if threats == 0 && s.PendingThreats == nil {
						for _, target := range targets {
							a := Action{Type: ActDelete, PawnID: pawn.ID, CardID: cardID, TargetID: target.PawnID}
							if cardID != "" {
								a.Type = ActPlayDelete
							}
							add(a)
						}
					}
				}
			}
		}
		if s.PendingThreats != nil {
			continue
		}
		ice := effectiveAbility(gd, pawn, placed.Attachments, "icebreaker")
		if ice != nil && ice.Activation != "none" && !(ice.Activation == "once-per-turn" && AbilityUseSpent(s, gd, p, pawn.ID, "icebreaker")) {
			for _, cardID := range cardsFor(ice.Activation, "icebreaker") {
				block := s.Cybernet.At(placed.Coord)
				if block != nil {
					def, ok := gd.BlockByID(block.BlockID)
					if ok && block.OwnerID != p.ID && (len(def.IceFaces) > 0 || def.IceValue != "" && def.IceValue != domain.IceNone) && !TargetIceNullified(gd, block.Attachments) && p.ControlMarkersPlaced < p.ControlMarkersTotal {
						a := Action{Type: ActIcebreakBlk, PawnID: pawn.ID, CardID: cardID, Coord: func() *domain.Coord { coord := placed.Coord; return &coord }()}
						if cardID != "" {
							a.Type = ActPlayIcebreakBlk
						}
						add(a)
					}
				}
				for _, target := range targets {
					def, ok := gd.PawnByID(target.PawnID)
					if ok && target.OwnerID != p.ID && (len(def.IceFaces) > 0 || def.IceValue != "" && def.IceValue != domain.IceNone) && !TargetIceNullified(gd, target.Attachments) {
						a := Action{Type: ActIcebreakPawn, PawnID: pawn.ID, CardID: cardID, TargetID: target.PawnID}
						if cardID != "" {
							a.Type = ActPlayIcebreakPawn
						}
						add(a)
					}
				}
			}
		}
		for _, threat := range s.Threats {
			if threat.Status == "eliminated" {
				probe(Action{Type: ActCollectThreat, PawnID: pawn.ID, TargetID: threat.ID})
			}
		}
		for _, cardID := range hand {
			c := cardByID(gd, cardID)
			if c == nil || c.Attach == nil {
				continue
			}
			switch c.Attach.As {
			case "pawn":
				if gd.RegressionFixture == "provisional-v1" {
					probe(Action{Type: ActAttachPawn, CardID: cardID, TargetID: pawn.ID})
				} else {
					for _, slot := range AvailableAttachmentSlots(gd, placed, c.Attach.Slot) {
						probe(Action{Type: ActAttachPawn, CardID: cardID, TargetID: pawn.ID, SlotRef: slot.Ref})
					}
				}
			case "block":
				probe(Action{Type: ActAttachBlock, CardID: cardID, PawnID: pawn.ID, Coord: func() *domain.Coord { coord := placed.Coord; return &coord }()})
			case "enemy":
				for _, target := range targets {
					if gd.RegressionFixture == "provisional-v1" {
						probe(Action{Type: ActAttachEnemy, CardID: cardID, PawnID: pawn.ID, TargetID: target.PawnID})
					} else {
						for _, slot := range AvailableAttachmentSlots(gd, target, c.Attach.Slot) {
							probe(Action{Type: ActAttachEnemy, CardID: cardID, PawnID: pawn.ID, TargetID: target.PawnID, SlotRef: slot.Ref})
						}
					}
				}
			}
		}
	}

	if s.PendingThreats == nil {
		for _, pawnID := range s.Eliminated {
			destinations := RebootDestinations(s, gd, p.ID, pawnID)
			if gd.RegressionFixture == "provisional-v1" {
				destinations = []SpaceRef{{}}
			}
			for _, d := range destinations {
				target := Action{PawnID: pawnID}
				if gd.RegressionFixture != "provisional-v1" {
					coord := d.Coord
					target.Coord = &coord
					target.SpaceID = d.SpaceID
				}
				if pawn, ok := gd.PawnByID(pawnID); ok {
					for _, ability := range pawn.Abilities {
						if ability.Ability == "reboot" && ability.Activation == "once-per-turn" {
							a := target
							a.Type = ActReboot
							probe(a)
						}
					}
				}
				for _, cardID := range hand {
					if cardActivates(gd, cardID, "reboot") {
						a := target
						a.Type = ActPlayRebootCard
						a.CardID = cardID
						probe(a)
					}
				}
				if len(p.Hand) >= 4 {
					a := target
					a.Type = ActPlayReboot
					a.CardIDs = append([]string{}, p.Hand[:4]...)
					probe(a)
				}
			}
		}
	}
	return out
}

func outsideTurnOptions(s *domain.GameState, gd *domain.GameData, id string) []AvailableAction {
	out := []AvailableAction{}
	index := -1
	for i, p := range s.Players {
		if p.ID == id {
			index = i
		}
	}
	if index < 0 {
		return out
	}
	candidate := CloneState(s)
	candidate.CurrentPlayer = index
	candidate.Phase = domain.PhaseAction
	for _, option := range AvailableActions(candidate, gd) {
		option.Action.PlayerID = id
		if !PermittedAbilityTurn(s, gd, option.Action) || !ApplyWithEvents(CloneState(s), gd, option.Action).Accepted {
			continue
		}
		for i := range option.Responses {
			option.Responses[i].PlayerID = id
		}
		out = append(out, option)
	}
	return out
}
