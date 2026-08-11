// Command zaibatsu runs a demo Speedrunners game to completion using the shared
// data in spec/data. It's the Go mirror of impl/ts/src/index.ts.
package main

import (
	"fmt"
	"os"

	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/engine"
)

func main() {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		fmt.Fprintln(os.Stderr, "error loading data:", err)
		os.Exit(1)
	}

	s, err := engine.NewGame(engine.Config{
		Data:        gd,
		PlayerNames: []string{"Arasaka", "Militech"},
		Seed:        42,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "error setting up game:", err)
		os.Exit(1)
	}

	fmt.Printf("Zaibatsu — %s demo (Go)\n", gd.Mode.Name)
	for i, p := range s.Players {
		fmt.Printf("  Player %d: %-10s pawn=%-18s markers=%d hand=%d\n",
			i+1, p.Name, p.PawnID, p.ControlMarkersTotal, len(p.Hand))
	}
	fmt.Println("Playing: each player places one control marker per turn...")

	guard := 0
	for engine.Winner(s) == "" {
		guard++
		if guard > 10000 {
			fmt.Fprintln(os.Stderr, "game failed to terminate")
			os.Exit(1)
		}
		cur := s.CurrentPlayerPtr().Name
		if err := engine.RunTurn(s, gd, []engine.Action{{Type: engine.ActPlaceMarker}}); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		_ = cur
	}

	win := engine.Winner(s)
	for _, p := range s.Players {
		if p.ID == win {
			fmt.Printf("Winner: %s (%s) on turn %d — %d/%d control markers placed.\n",
				p.Name, p.ID, s.Turn, p.ControlMarkersPlaced, p.ControlMarkersTotal)
		}
	}
}
