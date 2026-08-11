package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func TestSetupPlacesPawnsOnCore(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	if got := len(s.Cybernet.Pawns); got != 2 {
		t.Fatalf("expected 2 pawns on the board, got %d", got)
	}
	for _, p := range s.Players {
		pob := s.Cybernet.PawnByID(p.PawnID)
		if pob == nil {
			t.Fatalf("player %s pawn %q not on board", p.ID, p.PawnID)
		}
		if pob.Coord != origin {
			t.Errorf("pawn %q at %v, want origin", p.PawnID, pob.Coord)
		}
		if pob.OwnerID != p.ID {
			t.Errorf("pawn %q owner %q, want %q", p.PawnID, pob.OwnerID, p.ID)
		}
	}
}

func TestSpaceCapacity(t *testing.T) {
	cases := map[string]int{
		"normal":  1,
		"effect":  1,
		"double":  2,
		"special": domain.Unlimited,
		"pawn":    domain.Unlimited,
	}
	for typ, want := range cases {
		if got := domain.SpaceCapacity(typ); got != want {
			t.Errorf("SpaceCapacity(%q) = %d, want %d", typ, got, want)
		}
	}
}

func TestResolveSteps(t *testing.T) {
	rng := domain.NewRNG(1)
	if got := ResolveSteps(domain.Movement{Type: "steps", Steps: 3}, rng, 0); got != 3 {
		t.Errorf("fixed steps = %d, want 3", got)
	}
	if got := ResolveSteps(domain.Movement{Type: "steps", Steps: 3}, rng, 1); got != 4 {
		t.Errorf("fixed steps +1 modifier = %d, want 4", got)
	}
	if got := ResolveSteps(domain.Movement{Type: "steps", Steps: 1}, rng, -5); got != 0 {
		t.Errorf("clamped steps = %d, want 0", got)
	}
	if got := ResolveSteps(domain.Movement{Type: "hex"}, rng, 0); got != 1 {
		t.Errorf("hex steps = %d, want 1 block", got)
	}
	// Dice types stay within range.
	for i := 0; i < 200; i++ {
		d1 := ResolveSteps(domain.Movement{Type: "d6"}, rng, 0)
		if d1 < 1 || d1 > 6 {
			t.Fatalf("d6 out of range: %d", d1)
		}
		d2 := ResolveSteps(domain.Movement{Type: "2d6"}, rng, 0)
		if d2 < 2 || d2 > 12 {
			t.Fatalf("2d6 out of range: %d", d2)
		}
	}
}

func TestResolveStepsDeterministic(t *testing.T) {
	seq := func() []int {
		rng := domain.NewRNG(99)
		out := make([]int, 5)
		for i := range out {
			out[i] = ResolveSteps(domain.Movement{Type: "d6"}, rng, 0)
		}
		return out
	}
	a, b := seq(), seq()
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("d6 sequence not deterministic at %d: %v vs %v", i, a, b)
		}
	}
}

func TestCanActivateMovement(t *testing.T) {
	p := &domain.Player{OncePerTurnUsed: map[string]bool{}}
	if err := CanActivateMovement(p, &domain.Pawn{ID: "x", Movement: domain.Movement{Activation: "none"}}); err == nil {
		t.Error("expected error for 'none' activation")
	}
	if err := CanActivateMovement(p, &domain.Pawn{ID: "x", Movement: domain.Movement{Activation: "card"}}); err != nil {
		t.Errorf("card activation should be allowed: %v", err)
	}
	opt := &domain.Pawn{ID: "y", Movement: domain.Movement{Activation: "once-per-turn"}}
	if err := CanActivateMovement(p, opt); err != nil {
		t.Errorf("first once-per-turn should be allowed: %v", err)
	}
	p.OncePerTurnUsed[movementUsedKey("y")] = true
	if err := CanActivateMovement(p, opt); err == nil {
		t.Error("second once-per-turn should be blocked")
	}
}

// setupHexScenario builds a game, places a block adjacent to the core, and puts a
// controlled hex-movement pawn on the core. Returns the game, data, hex pawn id,
// owner, and the direction to the placed block.
func setupHexScenario(t *testing.T) (*domain.GameState, *domain.GameData, string, *domain.Player, int) {
	t.Helper()
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	origin := domain.Coord{Q: 0, R: 0}
	dir := 2
	if _, err := PlaceBlock(s, origin, dir, gd, "data-haven", rotFacing(t, gd, "data-haven", dir)); err != nil {
		t.Fatalf("place block: %v", err)
	}
	// speedrunner-yellow has hex movement; ensure a controlled instance is on core.
	owner := s.Players[0]
	if s.Cybernet.PawnByID("speedrunner-yellow") == nil {
		// Replace player A's board pawn with the hex pawn for the scenario.
		for _, pob := range s.Cybernet.Pawns {
			if pob.OwnerID == owner.ID {
				pob.PawnID = "speedrunner-yellow"
				break
			}
		}
	}
	// Make the hex pawn belong to player A and sit on the core.
	pob := s.Cybernet.PawnByID("speedrunner-yellow")
	pob.OwnerID = owner.ID
	pob.Coord = origin
	pob.SpaceID = "core"
	return s, gd, "speedrunner-yellow", owner, dir
}

func TestMoveHexOntoAdjacentBlock(t *testing.T) {
	s, gd, pawnID, _, dir := setupHexScenario(t)
	origin := domain.Coord{Q: 0, R: 0}
	pob, err := MoveHex(s, gd, pawnID, dir)
	if err != nil {
		t.Fatalf("MoveHex: %v", err)
	}
	if pob.Coord != origin.Neighbor(dir) {
		t.Errorf("pawn at %v, want %v", pob.Coord, origin.Neighbor(dir))
	}
	if pob.SpaceID == "" {
		t.Error("pawn landed on no space")
	}
}

func TestMoveHexRejectsEmptyCell(t *testing.T) {
	s, gd, pawnID, _, dir := setupHexScenario(t)
	// dir+3 (opposite) points to an empty cell — no block there.
	if _, err := MoveHex(s, gd, pawnID, (dir+3)%6); err == nil {
		t.Error("expected error moving onto an empty cell")
	}
}

func TestMoveHexRequiresHexMovement(t *testing.T) {
	s, gd, _, owner, dir := setupHexScenario(t)
	// speedrunner-red has 'steps' movement, not hex.
	pob := s.Cybernet.PawnByID("speedrunner-yellow")
	pob.PawnID = "speedrunner-red"
	owner.OncePerTurnUsed = map[string]bool{}
	if _, err := MoveHex(s, gd, "speedrunner-red", dir); err == nil {
		t.Error("expected error: speedrunner-red does not have hex movement")
	}
}

func TestMoveHexOncePerTurnMarker(t *testing.T) {
	s, gd, pawnID, owner, dir := setupHexScenario(t)
	// First hex move succeeds and records the marker (yellow is once-per-turn).
	if _, err := MoveHex(s, gd, pawnID, dir); err != nil {
		t.Fatalf("first MoveHex: %v", err)
	}
	if !owner.OncePerTurnUsed[movementUsedKey(pawnID)] {
		t.Fatal("expected once-per-turn marker to be set")
	}
	// A second activation this turn is blocked (even though another block exists
	// would be needed; the activation check fires first).
	if _, err := MoveHex(s, gd, pawnID, dir); err == nil {
		t.Error("expected second hex move this turn to be blocked")
	}
}

func TestCanEndOnCapacity(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 4})
	origin := domain.Coord{Q: 0, R: 0}
	dir := 0
	if _, err := PlaceBlock(s, origin, dir, gd, "data-haven", rotFacing(t, gd, "data-haven", dir)); err != nil {
		t.Fatalf("place: %v", err)
	}
	target := origin.Neighbor(dir)
	// data-haven space "a" is normal (capacity 1). Fill it, then a different
	// pawn cannot end there, but the occupying pawn itself still may.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "ghost", OwnerID: "p2", Coord: target, SpaceID: "a"})
	if err := CanEndOn(gd, s.Cybernet, target, "a", "someone-else"); err == nil {
		t.Error("expected full-space rejection")
	}
	if err := CanEndOn(gd, s.Cybernet, target, "a", "ghost"); err != nil {
		t.Errorf("occupying pawn should be allowed to stay: %v", err)
	}
	// The double space "b" (capacity 2) accepts a newcomer alongside one occupant.
	s.Cybernet.PlacePawn(&domain.PawnOnBoard{PawnID: "g2", OwnerID: "p2", Coord: target, SpaceID: "b"})
	if err := CanEndOn(gd, s.Cybernet, target, "b", "newcomer"); err != nil {
		t.Errorf("double space with one occupant should accept a newcomer: %v", err)
	}
}
