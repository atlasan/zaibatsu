// Package data loads the language-neutral game content from spec/data into
// domain types. It mirrors impl/ts/src/data. See DOCS/architecture.md.
package data

import (
	"crypto/sha256"
	"encoding/hex"
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

type validationManifest struct {
	ManifestVersion int `json:"manifestVersion"`
	Entries         []struct {
		Expansion string `json:"expansion"`
		Files     []struct {
			Path   string `json:"path"`
			SHA256 string `json:"sha256"`
		} `json:"files"`
	} `json:"entries"`
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

func sha256File(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(content)
	return hex.EncodeToString(digest[:]), nil
}

func repoRootFromSpecDataDir(specDataDir string) string {
	return filepath.Dir(filepath.Dir(filepath.Clean(specDataDir)))
}

func validateManifest(specDataDir, expansion string) error {
	repoRoot := repoRootFromSpecDataDir(specDataDir)
	manifestPath := filepath.Join(repoRoot, "spec", "validation", "manifest.json")
	hint := "run `bun tools/validate-spec.ts` from the repo root"
	if _, err := os.Stat(manifestPath); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("spec validation manifest is missing at %s; %s", manifestPath, hint)
		}
		return fmt.Errorf("stat %s: %w", manifestPath, err)
	}
	var manifest validationManifest
	if err := readJSON(manifestPath, &manifest); err != nil {
		return err
	}
	if manifest.ManifestVersion != 1 {
		return fmt.Errorf("unsupported spec validation manifest version %d; %s", manifest.ManifestVersion, hint)
	}
	var entry *struct {
		Expansion string `json:"expansion"`
		Files     []struct {
			Path   string `json:"path"`
			SHA256 string `json:"sha256"`
		} `json:"files"`
	}
	for i := range manifest.Entries {
		if manifest.Entries[i].Expansion == expansion {
			entry = &manifest.Entries[i]
			break
		}
	}
	if entry == nil {
		return fmt.Errorf("spec validation manifest has no entry for expansion %s; %s", expansion, hint)
	}
	for _, file := range entry.Files {
		target := filepath.Join(repoRoot, filepath.FromSlash(file.Path))
		if _, err := os.Stat(target); err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("validated spec file is missing: %s; %s", file.Path, hint)
			}
			return fmt.Errorf("stat %s: %w", target, err)
		}
		actual, err := sha256File(target)
		if err != nil {
			return fmt.Errorf("hash %s: %w", target, err)
		}
		if actual != file.SHA256 {
			return fmt.Errorf("spec validation manifest is stale for %s; expected %s, found %s; %s", file.Path, file.SHA256, actual, hint)
		}
	}
	return nil
}

// Load reads the game data for the given expansion (e.g. "speedrunners") from
// the given spec/data directory.
func Load(specDataDir, expansion string) (*domain.GameData, error) {
	if err := validateManifest(specDataDir, expansion); err != nil {
		return nil, err
	}
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
	for i := range gd.Blocks {
		gd.Blocks[i].DeriveBoundarySpaces() // fill the derived cross-edge boundary map
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
