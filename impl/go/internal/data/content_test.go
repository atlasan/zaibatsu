package data

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type validationManifestFixture struct {
	Entries []struct {
		Expansion string `json:"expansion"`
		Files     []struct {
			Path string `json:"path"`
		} `json:"files"`
	} `json:"entries"`
}

func repoRootForTests(t *testing.T) string {
	t.Helper()
	return filepath.Clean(filepath.Join("..", "..", "..", ".."))
}

func copyValidatedSpecFixture(t *testing.T, expansion string) string {
	t.Helper()
	root := repoRootForTests(t)
	manifestPath := filepath.Join(root, "spec", "validation", "manifest.json")
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	var manifest validationManifestFixture
	if err := json.Unmarshal(content, &manifest); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	var entry *struct {
		Expansion string `json:"expansion"`
		Files     []struct {
			Path string `json:"path"`
		} `json:"files"`
	}
	for i := range manifest.Entries {
		if manifest.Entries[i].Expansion == expansion {
			entry = &manifest.Entries[i]
			break
		}
	}
	if entry == nil {
		t.Fatalf("manifest missing expansion %s", expansion)
	}
	tempRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tempRoot, "spec", "validation"), 0o755); err != nil {
		t.Fatalf("mkdir validation dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempRoot, "spec", "validation", "manifest.json"), content, 0o644); err != nil {
		t.Fatalf("write manifest copy: %v", err)
	}
	for _, file := range entry.Files {
		from := filepath.Join(root, filepath.FromSlash(file.Path))
		to := filepath.Join(tempRoot, filepath.FromSlash(file.Path))
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", filepath.Dir(to), err)
		}
		data, err := os.ReadFile(from)
		if err != nil {
			t.Fatalf("read fixture %s: %v", from, err)
		}
		if err := os.WriteFile(to, data, 0o644); err != nil {
			t.Fatalf("write fixture %s: %v", to, err)
		}
	}
	return tempRoot
}

func TestLoadProvidesOptionalContentCollections(t *testing.T) {
	data, err := LoadDefault("speedrunners")
	if err != nil {
		t.Fatalf("LoadDefault: %v", err)
	}
	if data.ControlCards == nil || data.Threats == nil || data.Missions == nil {
		t.Fatal("optional content collections must be initialized")
	}
	if len(data.Modes) != 1 || data.Modes[0].ID != data.Mode.ID {
		t.Fatalf("modes fallback = %#v, want primary mode", data.Modes)
	}
}

func TestLoadRejectsStaleValidationManifest(t *testing.T) {
	tempRoot := copyValidatedSpecFixture(t, "speedrunners")
	blocksPath := filepath.Join(tempRoot, "spec", "data", "speedrunners", "blocks.json")
	original, err := os.ReadFile(blocksPath)
	if err != nil {
		t.Fatalf("read blocks fixture: %v", err)
	}
	if err := os.WriteFile(blocksPath, append(original, '\n'), 0o644); err != nil {
		t.Fatalf("mutate blocks fixture: %v", err)
	}
	_, err = Load(filepath.Join(tempRoot, "spec", "data"), "speedrunners")
	if err == nil {
		t.Fatal("Load should reject stale validated spec content")
	}
	if got := err.Error(); !strings.Contains(got, "spec validation manifest is stale") {
		t.Fatalf("Load error = %q, want stale manifest guidance", got)
	}
}
