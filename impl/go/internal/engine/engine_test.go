package engine

import (
	"testing"

	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
)

func loadOrSkip(t *testing.T) *domain.GameData {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatalf("load speedrunners data: %v", err)
	}
	return gd
}

func TestControlMarkersFor(t *testing.T) {
	gd := loadOrSkip(t)
	cases := map[int]int{2: 10, 3: 8, 4: 6}
	for n, want := range cases {
		if got := ControlMarkersFor(gd.Mode, n); got != want {
			t.Errorf("ControlMarkersFor(%d) = %d, want %d", n, got, want)
		}
	}
	// Unlisted count falls back to the mode default.
	if got := ControlMarkersFor(gd.Mode, 7); got != 8 {
		t.Errorf("ControlMarkersFor(7) fallback = %d, want 8 (default)", got)
	}
}

func TestNewGameSetup(t *testing.T) {
	gd := loadOrSkip(t)
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"Alice", "Bob"}, Seed: 42})
	if err != nil {
		t.Fatalf("NewGame: %v", err)
	}
	if len(s.Players) != 2 {
		t.Fatalf("expected 2 players, got %d", len(s.Players))
	}
	for _, p := range s.Players {
		if p.ControlMarkersTotal != 10 {
			t.Errorf("player %s markers = %d, want 10", p.ID, p.ControlMarkersTotal)
		}
		if p.PawnID == "" {
			t.Errorf("player %s has no pawn assigned", p.ID)
		}
	}
	// Distinct starter pawns.
	if s.Players[0].PawnID == s.Players[1].PawnID {
		t.Errorf("players got the same starter pawn %q", s.Players[0].PawnID)
	}
	// Opening deal is asymmetric: p1 gets fewer than p2.
	if len(s.Players[0].Hand) >= len(s.Players[1].Hand) {
		t.Errorf("expected asymmetric opening deal, got p1=%d p2=%d",
			len(s.Players[0].Hand), len(s.Players[1].Hand))
	}
}

func TestDeterminism(t *testing.T) {
	gd := loadOrSkip(t)
	mk := func() *domain.GameState {
		s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B", "C"}, Seed: 7})
		return s
	}
	a, b := mk(), mk()
	for i := range a.Players {
		if a.Players[i].PawnID != b.Players[i].PawnID {
			t.Fatalf("same seed produced different pawn assignment at %d", i)
		}
	}
	if len(a.Deck) == 0 || a.Deck[0] != b.Deck[0] {
		t.Fatalf("same seed produced different deck order")
	}
}

func TestRecycleRefillsHand(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 1})
	// Player 1 opened with fewer than max; after their turn's recycle they should be at max.
	if err := RunTurn(s, gd, []Action{{Type: ActPass}}); err != nil {
		t.Fatalf("RunTurn: %v", err)
	}
	// After RunTurn, current player advanced to p2; inspect p1 (index 0).
	if got := len(s.Players[0].Hand); got != s.Players[0].MaxHandSize {
		t.Errorf("p1 hand after recycle = %d, want %d", got, s.Players[0].MaxHandSize)
	}
}

func TestTurnAdvances(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B", "C"}, Seed: 3})
	if s.CurrentPlayer != 0 {
		t.Fatalf("expected to start on player 0")
	}
	_ = RunTurn(s, gd, nil)
	if s.CurrentPlayer != 1 {
		t.Errorf("after one turn CurrentPlayer = %d, want 1", s.CurrentPlayer)
	}
	_ = RunTurn(s, gd, nil)
	_ = RunTurn(s, gd, nil)
	if s.CurrentPlayer != 0 {
		t.Errorf("after three turns CurrentPlayer = %d, want 0 (wrapped)", s.CurrentPlayer)
	}
}

func TestWinByPlacingAllMarkers(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 9})
	total := s.Players[0].ControlMarkersTotal
	guard := 0
	for Winner(s) == "" {
		guard++
		if guard > 1000 {
			t.Fatal("game did not terminate")
		}
		// Whoever's turn it is places one marker.
		if err := RunTurn(s, gd, []Action{{Type: ActPlaceMarker}}); err != nil {
			t.Fatalf("RunTurn: %v", err)
		}
	}
	// Player A goes first and places one per turn, so A should win on turn `total`.
	if Winner(s) != "p1" {
		t.Errorf("winner = %q, want p1", Winner(s))
	}
	if s.Players[0].ControlMarkersPlaced != total {
		t.Errorf("winner placed %d markers, want %d", s.Players[0].ControlMarkersPlaced, total)
	}
}

func TestCannotOverplaceMarkers(t *testing.T) {
	gd := loadOrSkip(t)
	s, _ := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 5})
	p := s.CurrentPlayerPtr()
	p.ControlMarkersPlaced = p.ControlMarkersTotal
	if err := Apply(s, gd, Action{Type: ActPlaceMarker}); err == nil {
		t.Errorf("expected error placing marker with none remaining")
	}
}
