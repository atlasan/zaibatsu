package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func sourceGame(t *testing.T) (*domain.GameData, *domain.GameState) {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 5})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	s.Players[0].PawnID = "speedrunner-blue"
	s.Players[0].Color = "blue"
	s.Players[1].PawnID = "speedrunner-green"
	s.Players[1].Color = "green"
	s.Cybernet.Pawns = []*domain.PawnOnBoard{{PawnID: "speedrunner-blue", OwnerID: "p1", Coord: domain.Coord{}, SpaceID: "a"}, {PawnID: "speedrunner-green", OwnerID: "p2", Coord: domain.Coord{Q: -1}, SpaceID: "a"}}
	s.OutOfGame = []string{"speedrunner-pink", "speedrunner-orange"}
	s.Reserve = []string{}
	for _, pawn := range gd.Pawns {
		if s.Cybernet.PawnByID(pawn.ID) == nil && !containsString(s.OutOfGame, pawn.ID) {
			s.Reserve = append(s.Reserve, pawn.ID)
		}
	}
	for i := range s.ControlCards {
		c := &s.ControlCards[i]
		c.OwnerID = ""
		c.Zone = "out-of-game"
		if c.Subject.ID == "speedrunner-blue" {
			c.OwnerID = "p1"
			c.Zone = "control"
		}
		if c.Subject.ID == "speedrunner-green" {
			c.OwnerID = "p2"
			c.Zone = "control"
		}
	}
	dir := 0
	gd.Blocks = append(gd.Blocks, domain.Block{ID: "source-test-board", Name: "Synthetic rule board", Expansion: domain.ExpSpeedrunners, IceValue: domain.IceHigh, IceFaces: []int{6}, Edges: []bool{true, true, true, true, true, true}, BoundarySpaces: [][]string{{"a"}, {"a"}, {"a"}, {"a"}, {"a"}, {"a"}}, Spaces: []domain.Space{{ID: "a", Type: "special", Capacity: domain.UnlimitedCapacity, Direction: &dir, Neighbors: []string{"b"}}, {ID: "b", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"a", "c"}}, {ID: "c", Type: "special", Capacity: domain.UnlimitedCapacity, Neighbors: []string{"b"}}}})
	s.Cybernet.Blocks = []*domain.PlacedBlock{{BlockID: "source-test-board", Coord: domain.Coord{}}, {BlockID: "source-test-board", Coord: domain.Coord{Q: -1}}}
	return gd, s
}

func TestSourceCoreAndPrintedStarters(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	core, _ := gd.CentralCore()
	if core.Provisional || len(core.Spaces) != 1 || core.Spaces[0].Capacity != domain.UnlimitedCapacity {
		t.Fatal(core)
	}
	ids := []string{"speedrunner-blue", "speedrunner-green", "speedrunner-pink", "speedrunner-orange"}
	faces := []int{1, 2, 4, 5}
	for i, id := range ids {
		pawn, ok := gd.PawnByID(id)
		if !ok {
			t.Fatal(id)
		}
		if pawn.Provisional || pawn.Movement.Activation != "card" || len(pawn.Defense) != 6 || findAbility(pawn, "delete") != nil || pawn.IcebreakerModifier == nil || !slices.Equal(pawn.IcebreakerModifier.Faces, []int{faces[i]}) {
			t.Fatal(pawn)
		}
		for n, die := range pawn.Defense {
			if die.Value != n+1 || die.Shielded != (n < 2) {
				t.Fatal(pawn.Defense)
			}
		}
	}
	for n := 2; n <= 4; n++ {
		s, err := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B", "C", "D"}[:n], Seed: 42})
		if err != nil {
			t.Fatal(err)
		}
		excluded := 0
		controlled := 0
		for _, card := range s.ControlCards {
			if card.Zone == "out-of-game" {
				excluded++
			}
			if card.Zone == "common" && card.Subject.ID != "idoru" && card.Subject.ID != "gynoid" && card.Subject.ID != "drone-mk-2" && card.Subject.ID != "drone-probe" && card.Subject.ID != "drone-turret" {
				t.Fatal("unused starter card incorrectly in common area")
			}
			if card.OwnerID != "" {
				controlled++
			}
		}
		if controlled != n || len(s.ControlCards) != len(gd.ControlCards) || excluded != 4-n || len(s.OutOfGame) != 4-n {
			t.Fatal(s.ControlCards)
		}
		for i, p := range s.Players {
			want := []int{3, 4, 5, 5}[i]
			if len(p.Hand) != want || p.PawnID != "speedrunner-"+p.Color {
				t.Fatal(p)
			}
		}
	}
	legacy, err := data.LoadRegression("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := legacy.PawnByID("speedrunner-red"); !ok {
		t.Fatal("legacy corpus changed")
	}
}

func TestSourceOctagonArrowAndSearch(t *testing.T) {
	gd, s := sourceGame(t)
	s.Players[0].Hand = []string{"octagon-dex", "dj"}
	action := Action{Type: ActPlayMove, PawnID: "speedrunner-blue", CardID: "dj", Path: []SpaceRef{{Coord: domain.Coord{Q: -1}, SpaceID: "a"}}}
	before := Snapshot(s)
	rng := *s.RNG
	if ApplyWithEvents(s, gd, action).Accepted || Snapshot(s) != before {
		t.Fatal("illegal arrow movement changed state")
	}
	copy := *s.RNG
	if copy.Intn(1000) != rng.Intn(1000) {
		t.Fatal("rejection advanced RNG")
	}
	if !ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: "octagon-dex", TargetID: "speedrunner-blue"}).Accepted {
		t.Fatal("attach")
	}
	pawn, _ := gd.PawnByID("speedrunner-blue")
	if effectiveAbility(gd, pawn, s.Cybernet.Pawns[0].Attachments, "search") != nil {
		t.Fatal("Search not removed")
	}
	if ApplyWithEvents(s, gd, Action{Type: ActPlaySearch, CardID: "dj", PawnID: "speedrunner-blue"}).Accepted {
		t.Fatal("Search allowed")
	}
	if !ApplyWithEvents(s, gd, action).Accepted || !slices.Equal(s.PlayedCards, []string{"dj"}) {
		t.Fatal("arrow exception failed")
	}
}

func TestSourceSimstimMovementProvisionalBonus(t *testing.T) {
	gd, s := sourceGame(t)
	s.Players[0].Hand = []string{"simstim-record", "dj"}
	if !ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: "simstim-record", TargetID: "speedrunner-blue"}).Accepted {
		t.Fatal("attach")
	}
	pawn, _ := gd.PawnByID("speedrunner-blue")
	if len(EffectiveMovementOptions(gd, pawn, s.Cybernet.Pawns[0].Attachments)) != 0 {
		t.Fatal("movement available")
	}
	before := Snapshot(s)
	if ApplyWithEvents(s, gd, Action{Type: ActPlayMove, CardID: "dj", PawnID: "speedrunner-blue", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}}).Accepted || Snapshot(s) != before {
		t.Fatal("card bypassed cancellation")
	}
	if !cardByID(gd, "simstim-record").Provisional {
		t.Fatal("unresolved bonus promoted")
	}
}

func TestSourceAcceleratorStepAndCost(t *testing.T) {
	for _, cardID := range []string{"accelerator-transgenic-therapy", "hyper-accelerator", "accela-accelerator"} {
		gd, s := sourceGame(t)
		s.Players[0].Hand = []string{cardID, "dj"}
		attach := Action{Type: ActAttachPawn, CardID: cardID, TargetID: "speedrunner-blue"}
		before := Snapshot(s)
		if ApplyWithEvents(s, gd, attach).Accepted || Snapshot(s) != before {
			t.Fatal("unpaid attach accepted")
		}
		s.Players[0].BonusCounters = 1
		if !ApplyWithEvents(s, gd, attach).Accepted || s.Players[0].BonusCounters != 0 {
			t.Fatal("cost not paid")
		}
		action := Action{Type: ActPlayMove, CardID: "dj", PawnID: "speedrunner-blue", Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}, {Coord: domain.Coord{}, SpaceID: "c"}}}
		if !ApplyWithEvents(s, gd, action).Accepted {
			t.Fatal("movement modifier not applied")
		}
		eliminatePawn(s, "speedrunner-blue", gd)
		if s.Players[0].BonusCounters != 1 || !slices.Contains(s.Discard, cardID) {
			t.Fatal("cost not refunded")
		}
	}
}

func TestSourceESynapseMovement(t *testing.T) {
	for i, cardID := range []string{"biochip", "e-synapse-neural-interface"} {
		gd, s := sourceGame(t)
		s.Players[0].Hand = []string{cardID}
		s.Players[0].BonusCounters = i + 1
		if !ApplyWithEvents(s, gd, Action{Type: ActAttachPawn, CardID: cardID, TargetID: "speedrunner-blue"}).Accepted {
			t.Fatal("attach")
		}
		pawn, _ := gd.PawnByID("speedrunner-blue")
		options := EffectiveMovementOptions(gd, pawn, s.Cybernet.Pawns[0].Attachments)
		if options[1].Movement.Steps != []int{3, 5}[i] || options[1].Movement.Activation != "once-per-turn" {
			t.Fatal(options)
		}
		action := Action{Type: ActMoveSteps, PawnID: "speedrunner-blue", MovementIndex: 1, Path: []SpaceRef{{Coord: domain.Coord{}, SpaceID: "b"}}}
		if !ApplyWithEvents(s, gd, action).Accepted {
			t.Fatal("move")
		}
		action.Path[0].SpaceID = "a"
		if ApplyWithEvents(s, gd, action).Accepted {
			t.Fatal("second use")
		}
		s.Phase = domain.PhaseBeginning
		AdvancePhase(s, gd)
		if !ApplyWithEvents(s, gd, action).Accepted {
			t.Fatal("turn reset")
		}
	}
}

func TestSourceStarterIcebreakerFace(t *testing.T) {
	gd, s := sourceGame(t)
	s.RNG = domain.NewRNG(79)
	result, err := IcebreakBlock(s, gd, "speedrunner-blue", domain.Coord{}, 0)
	if err != nil || !slices.Equal(result.Roll, []int{1}) || !result.Success {
		t.Fatal(result, err)
	}
	s.Cybernet.Blocks[0].BlockID = "central-core"
	if _, err := IcebreakBlock(s, gd, "speedrunner-blue", domain.Coord{}, 0); err == nil {
		t.Fatal("actor face made Core controllable")
	}
}

func TestSourceRebootControlAndClone(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, _ := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 5})
	pawnID := s.Players[0].PawnID
	eliminatePawn(s, pawnID, gd)
	if _, err := Reboot(s, gd, pawnID, "p2"); err == nil {
		t.Fatal("stole eliminated starter")
	}
	if _, err := Reboot(s, gd, pawnID, "p1"); err != nil {
		t.Fatal(err)
	}
	clone := CloneState(s)
	clone.ControlCards[0].OwnerID = "changed"
	if s.ControlCards[0].OwnerID == "changed" {
		t.Fatal("shared control-card state")
	}
}

func TestSourceFoundationGolden(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, _ := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if got, want := Snapshot(s), readGolden(t, "source-foundation.snap"); got != want {
		t.Fatalf("source foundation parity\ngot %s\nwant %s", got, want)
	}
}

func TestSourceActionQueriesPreserveStateAndRNG(t *testing.T) {
	gd, s := sourceGame(t)
	s.Players[0].Hand = []string{"octagon-dex", "dj", "biochip"}
	s.Players[0].BonusCounters = 1
	before := Snapshot(s)
	rng := *s.RNG
	options := AvailableActions(s, gd)
	found := false
	for _, o := range options {
		if o.Action.Type == ActAttachPawn && o.Action.CardID == "biochip" {
			found = true
		}
		if len(o.Targets) > 0 {
			o.Targets[0].Coord.Q = 999
		}
	}
	copy := *s.RNG
	if !found || before != Snapshot(s) || copy.Intn(1000) != rng.Intn(1000) {
		t.Fatal("query changed state/RNG or omitted paid attachment")
	}
	gd.Cards = append(gd.Cards, domain.ActionCard{ID: "query-use-die", Name: "Synthetic use budget", Attach: &domain.Attach{As: "pawn", Slot: "gadget", GrantsMovement: []domain.MovementGrant{{Type: "fixed", Amount: 1}}, AbilityUses: []domain.AbilityUse{{Ability: "move", Dice: "d6"}}}})
	s.Cybernet.Pawns[0].Attachments = []domain.Attachment{{CardID: "query-use-die", Slot: "gadget"}}
	before = Snapshot(s)
	rng = *s.RNG
	AvailableActions(s, gd)
	AvailableActions(s, gd)
	if Snapshot(s) != before || s.RNG.Intn(1000) != rng.Intn(1000) {
		t.Fatal("query rolled a live use budget")
	}
}

func TestSourceActionTemplatesParity(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, _ := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	AdvancePhase(s, gd)
	var want []AvailableAction
	if err := json.Unmarshal([]byte(readGolden(t, "source-options.json")), &want); err != nil {
		t.Fatal(err)
	}
	if got := AvailableActions(s, gd); !reflect.DeepEqual(got, want) {
		t.Fatalf("action template parity\ngot %#v\nwant %#v", got, want)
	}
}

func TestSourceModesRejectUnsupportedSetup(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	dir, err := data.FindSpecDir()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "shadowraiders", "modes.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Modes []domain.Mode `json:"modes"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	for _, mode := range file.Modes {
		gd.Mode = mode
		_, err := NewGame(Config{AllowProvisional: true, Data: gd, PlayerNames: make([]string, mode.Players.Min), Seed: 42})
		if err == nil {
			t.Fatalf("unsupported mode %s ran base setup", mode.ID)
		}
	}
}

func TestSourceOfficialReadinessAndConditions(t *testing.T) {
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	config := Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42}
	if _, err := NewGame(config); err == nil || !strings.Contains(err.Error(), "unsupported block placement effects") {
		t.Fatal(err)
	}
	original := gd.Blocks
	supported := []domain.Block{}
	for _, b := range gd.Blocks {
		if SupportsSearchBlockEffect(&b) {
			supported = append(supported, b)
		}
	}
	gd.Blocks = supported
	if _, err := NewGame(config); err == nil || !strings.Contains(err.Error(), "official mode requires non-provisional content") {
		t.Fatal(err)
	}
	gd.Blocks = original
	config.AllowProvisional = true
	if _, err := NewGame(config); err != nil {
		t.Fatal(err)
	}
	gd.Mode.Win = []string{"unimplemented-win"}
	if _, err := NewGame(config); err == nil || !strings.Contains(err.Error(), "unsupported win condition") {
		t.Fatal(err)
	}
	gd.Mode.Win = []string{"all-control-markers-placed"}
	gd.Mode.Lose = []string{"unimplemented-loss"}
	if _, err := NewGame(config); err == nil || !strings.Contains(err.Error(), "unsupported lose condition") {
		t.Fatal(err)
	}
}
