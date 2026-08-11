// Package data loads the language-neutral game content from spec/data into
// domain types. It mirrors impl/ts/src/data. See DOCS/architecture.md.
package data

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// FindSpecDir walks up from the current working directory to locate the repo's
// spec/data directory, so tests and the demo work regardless of where they run.
func FindSpecDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(dir, "spec", "data")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not locate spec/data above working directory")
		}
		dir = parent
	}
}

type blocksFile struct {
	Blocks []domain.Block `json:"blocks"`
}
type pawnsFile struct {
	Pawns []domain.Pawn `json:"pawns"`
}
type cardsFile struct {
	Cards []domain.ActionCard `json:"cards"`
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}

// Load reads the game data for the given expansion (e.g. "speedrunners") from
// the given spec/data directory.
func Load(specDataDir, expansion string) (*domain.GameData, error) {
	base := filepath.Join(specDataDir, expansion)

	var bf blocksFile
	if err := readJSON(filepath.Join(base, "blocks.json"), &bf); err != nil {
		return nil, err
	}
	var pf pawnsFile
	if err := readJSON(filepath.Join(base, "pawns.json"), &pf); err != nil {
		return nil, err
	}
	var cf cardsFile
	if err := readJSON(filepath.Join(base, "action-cards.json"), &cf); err != nil {
		return nil, err
	}
	var mode domain.Mode
	if err := readJSON(filepath.Join(base, "mode.json"), &mode); err != nil {
		return nil, err
	}

	gd := &domain.GameData{
		Blocks: bf.Blocks,
		Pawns:  pf.Pawns,
		Cards:  cf.Cards,
		Mode:   mode,
	}
	if err := loadOptionalContent(base, gd); err != nil {
		return nil, err
	}
	if err := validate(gd); err != nil {
		return nil, err
	}
	return gd, nil
}

// LoadDefault locates spec/data and loads the given expansion.
func LoadDefault(expansion string) (*domain.GameData, error) {
	dir, err := FindSpecDir()
	if err != nil {
		return nil, err
	}
	return Load(dir, expansion)
}

// validate performs light structural checks the loader guarantees to the engine.
func validate(gd *domain.GameData) error {
	if len(gd.Blocks) == 0 {
		return fmt.Errorf("no blocks loaded")
	}
	cores := 0
	for _, b := range gd.Blocks {
		if b.IsCentralCore {
			cores++
		}
	}
	if cores != 1 {
		return fmt.Errorf("expected exactly one Central Core block, found %d", cores)
	}
	starters := 0
	for _, p := range gd.Pawns {
		if p.IsStarter {
			starters++
		}
	}
	if starters == 0 {
		return fmt.Errorf("no starter pawns found")
	}
	if len(gd.Cards) == 0 {
		return fmt.Errorf("no action cards loaded")
	}
	if gd.Mode.ID == "" {
		return fmt.Errorf("mode has no id")
	}
	return nil
}
