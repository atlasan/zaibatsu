package engine

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

// Throwaway: regenerates the shared golden fixtures from the current (parity-
// verified) deterministic output. Run only with REGEN_GOLDEN=1, then delete.
func TestRegenGolden(t *testing.T) {
	if os.Getenv("REGEN_GOLDEN") != "1" {
		t.Skip("set REGEN_GOLDEN=1 to regenerate")
	}
	sd, _ := data.FindSpecDir()
	root := filepath.Dir(filepath.Dir(sd))
	gd := loadOrSkip(t)

	s1, _ := NewGame(Config{Data: gd, PlayerNames: []string{"Arasaka", "Militech"}, Seed: 42})
	for Winner(s1) == "" {
		if err := RunTurn(s1, gd, []Action{{Type: ActPlaceMarker}}); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "golden", "game1.snap"), []byte(Snapshot(s1)+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	s2, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 7})
	o := domain.Coord{Q: 0, R: 0}
	s2.Cybernet.Pawns = []*domain.PawnOnBoard{}
	s2.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-green", OwnerID: "p1", Coord: o, SpaceID: "core"})
	s2.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "speedrunner-yellow", OwnerID: "p2", Coord: o, SpaceID: "core"})
	if err := Apply(s2, gd, Action{Type: ActDelete, PawnID: "speedrunner-green", TargetID: "speedrunner-yellow"}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "golden", "scenario1.snap"), []byte(Snapshot(s2)+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Log("regenerated golden fixtures")
}
