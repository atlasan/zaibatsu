package data

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

type controlCardsFile struct {
	ControlCards []domain.ControlCard `json:"controlCards"`
}
type threatsFile struct {
	Threats []domain.Threat `json:"threats"`
}
type missionsFile struct {
	Missions []domain.MissionCard `json:"missions"`
}
type modesFile struct {
	Modes []domain.Mode `json:"modes"`
}

func readOptionalJSON(path string, value any) error {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	return readJSON(path, value)
}

// loadOptionalContent exposes expanded data without requiring incomplete
// expansion bundles to masquerade as executable game data.
func loadOptionalContent(base string, gd *domain.GameData) error {
	var controlCards controlCardsFile
	if err := readOptionalJSON(filepath.Join(base, "control-cards.json"), &controlCards); err != nil {
		return err
	}
	var threats threatsFile
	if err := readOptionalJSON(filepath.Join(base, "threats.json"), &threats); err != nil {
		return err
	}
	var missions missionsFile
	if err := readOptionalJSON(filepath.Join(base, "missions.json"), &missions); err != nil {
		return err
	}
	var modes modesFile
	if err := readOptionalJSON(filepath.Join(base, "modes.json"), &modes); err != nil {
		return err
	}
	gd.ControlCards = controlCards.ControlCards
	gd.Threats = threats.Threats
	gd.Missions = missions.Missions
	gd.Modes = modes.Modes
	if gd.ControlCards == nil {
		gd.ControlCards = []domain.ControlCard{}
	}
	if gd.Threats == nil {
		gd.Threats = []domain.Threat{}
	}
	if gd.Missions == nil {
		gd.Missions = []domain.MissionCard{}
	}
	if len(gd.Modes) == 0 {
		gd.Modes = []domain.Mode{gd.Mode}
	}
	return nil
}
