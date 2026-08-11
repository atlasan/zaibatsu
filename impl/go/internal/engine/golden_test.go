package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Golden-game tests: run a scripted game/scenario and assert the canonical
// snapshot matches a SHARED golden fixture under <repo>/golden that the TS mirror
// asserts against too. A divergence in either mirror fails here — a whole-state
// cross-mirror equivalence check. See DOCS/parity.md.

func readGolden(t *testing.T, name string) string {
	t.Helper()
	sd, err := data.FindSpecDir()
	if err != nil {
		t.Fatalf("locate spec dir: %v", err)
	}
	root := filepath.Dir(filepath.Dir(sd)) // <root>/spec/data -> <root>
	b, err := os.ReadFile(filepath.Join(root, "golden", name))
	if err != nil {
		t.Fatalf("read golden %s: %v", name, err)
	}
	return strings.TrimSpace(string(b))
}

// TestGoldenGame1 plays the seed-42 game to completion and snapshots it.
func TestGoldenGame1(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"Arasaka", "Militech"}, Seed: 42})
	guard := 0
	for Winner(s) == "" {
		if guard++; guard > 10000 {
			t.Fatal("game did not terminate")
		}
		if err := RunTurn(s, gd, []Action{{Type: ActPlaceMarker}}); err != nil {
			t.Fatalf("RunTurn: %v", err)
		}
	}
	got := Snapshot(s)
	if want := readGolden(t, "game1.snap"); got != want {
		t.Errorf("game1 snapshot mismatch\n got: %s\nwant: %s", got, want)
	}
}

// TestGoldenScenario1 sets up a combat scenario and snapshots after a Delete.
func TestGoldenScenario1(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	o := domain.Coord{Q: 0, R: 0}
	s.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: o, SpaceID: "core"})
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: o, SpaceID: "core"})
	if err := Apply(s, gd, Action{Type: ActDelete, PawnID: "speedrunner-green", TargetID: "speedrunner-yellow"}); err != nil {
		t.Fatalf("Apply delete: %v", err)
	}
	got := Snapshot(s)
	if want := readGolden(t, "scenario1.snap"); got != want {
		t.Errorf("scenario1 snapshot mismatch\n got: %s\nwant: %s", got, want)
	}
}
