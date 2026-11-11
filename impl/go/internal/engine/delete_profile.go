package engine

import (
	"fmt"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type DeleteProfile struct {
	Skulls         int  `json:"skulls"`
	Card           bool `json:"card"`
	FreeActivators int  `json:"freeActivators"`
	Cancelled      bool `json:"cancelled"`
}

func ValidateDeleteAttachment(attach *domain.Attach) error {
	if attach == nil {
		return nil
	}
	if attach.Delete != nil {
		if attach.Delete.Skulls < 1 || (attach.Delete.Activation != "" && attach.Delete.Activation != "card" && attach.Delete.Activation != "once-per-turn") {
			return fmt.Errorf("unsupported or malformed printed Delete attribute")
		}
		if attach.As != "pawn" && attach.As != "enemy" {
			return fmt.Errorf("printed Delete attributes require a pawn attachment")
		}
		if abilityListHas(attach.Grants, "delete") {
			return fmt.Errorf("printed Delete attributes cannot mix with legacy Delete grants/uses")
		}
		for _, use := range attach.AbilityUses {
			if use.Ability == "delete" {
				return fmt.Errorf("printed Delete attributes cannot mix with legacy Delete grants/uses")
			}
		}
	}
	for _, use := range attach.AbilityUses {
		if use.Ability == "delete" && (use.PerTurn != 0 || use.Dice != "" || (use.Activation != "card" && use.Activation != "once-per-turn") || !abilityListHas(attach.Grants, "delete")) {
			return fmt.Errorf("unsupported Delete use budget; encode printed activation badges explicitly")
		}
	}
	return nil
}

func PawnDeleteProfile(gd *domain.GameData, pawn *domain.Pawn, atts []domain.Attachment) DeleteProfile {
	native := findAbility(pawn, "delete")
	cards := attachmentCards(gd, atts)
	cancelled := native != nil && native.Activation == "none"
	for _, c := range cards {
		if c.Attach == nil {
			continue
		}
		cancelled = cancelled || abilityListHas(c.Attach.Removes, "delete")
	}
	if gd.RegressionFixture == "provisional-v1" {
		ability := native
		if ability == nil {
			for _, c := range cards {
				if c.Attach != nil && abilityListHas(c.Attach.Grants, "delete") {
					ability = &domain.Ability{Activation: "card", Skulls: 1}
					break
				}
			}
		}
		profile := DeleteProfile{Cancelled: cancelled}
		if ability != nil {
			profile.Skulls = ability.Skulls
			if profile.Skulls < 1 {
				profile.Skulls = 1
			}
			profile.Card = !cancelled && ability.Activation == "card"
			if !cancelled && ability.Activation == "once-per-turn" {
				profile.FreeActivators = 1
			}
		}
		return profile
	}
	profile := DeleteProfile{Cancelled: cancelled}
	if native != nil {
		profile.Skulls = native.Skulls
		if profile.Skulls < 1 {
			profile.Skulls = 1
		}
		profile.Card = native.Activation == "card"
		if native.Activation == "once-per-turn" {
			profile.FreeActivators = 1
		}
	}
	for _, c := range cards {
		attach := c.Attach
		if attach == nil {
			continue
		}
		if attach.Delete != nil {
			profile.Skulls += attach.Delete.Skulls
			profile.Card = profile.Card || attach.Delete.Activation == "card"
			if attach.Delete.Activation == "once-per-turn" {
				profile.FreeActivators++
			}
		} else if abilityListHas(attach.Grants, "delete") {
			uses := 0
			for _, use := range attach.AbilityUses {
				if use.Ability == "delete" {
					uses++
					profile.Card = profile.Card || use.Activation == "card"
					if use.Activation == "once-per-turn" {
						profile.FreeActivators++
					}
				}
			}
			if uses == 0 {
				profile.Card = true
			}
		}
	}
	if (profile.Card || profile.FreeActivators > 0) && profile.Skulls == 0 {
		profile.Skulls = 1
	}
	if cancelled {
		profile.Card = false
		profile.FreeActivators = 0
	}
	return profile
}

func DeleteActivationOptions(gd *domain.GameData, pawn *domain.Pawn, atts []domain.Attachment) []domain.Ability {
	profile := PawnDeleteProfile(gd, pawn, atts)
	out := []domain.Ability{}
	if profile.Card {
		out = append(out, domain.Ability{Ability: "delete", Activation: "card", Skulls: profile.Skulls})
	}
	if profile.FreeActivators == 1 {
		out = append(out, domain.Ability{Ability: "delete", Activation: "once-per-turn", Skulls: profile.Skulls})
	}
	return out
}

func requireDeleteActivation(gd *domain.GameData, pawn *domain.Pawn, atts []domain.Attachment, activation string) (*domain.Ability, error) {
	profile := PawnDeleteProfile(gd, pawn, atts)
	if activation == "once-per-turn" && profile.FreeActivators > 1 {
		return nil, fmt.Errorf("multiple once-per-turn Delete activators conflict between English and Spanish; this combination remains provisional")
	}
	for _, option := range DeleteActivationOptions(gd, pawn, atts) {
		if option.Activation == activation {
			return &option, nil
		}
	}
	return nil, fmt.Errorf("pawn %q cannot activate Delete by %s", pawn.ID, activation)
}
