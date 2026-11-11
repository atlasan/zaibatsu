package engine

import (
	"encoding/json"
	"github.com/zaibatsu/zaibatsu-go/internal/data"
	"github.com/zaibatsu/zaibatsu-go/internal/domain"
	"reflect"
	"slices"
	"testing"
)

func broadcastFixture(t *testing.T, retained bool) malwareFixture {
	t.Helper()
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = domain.PhaseAction
	for _, p := range s.Players {
		s.Deck = append(s.Deck, p.Hand...)
		p.Hand = []string{}
	}
	f := malwareFixture{gd: gd, s: s, actor: s.Players[0].PawnID, target: s.Players[1].PawnID}
	for _, id := range []string{"move-1", "move-2", "move-2", "dj", "worm"} {
		f.take(t, 0, id)
	}
	s.BlockPile = slices.DeleteFunc(s.BlockPile, func(id string) bool { return id == "clandestine-broadcast" })
	s.Cybernet.Blocks = append(s.Cybernet.Blocks, &domain.PlacedBlock{BlockID: "clandestine-broadcast", Coord: domain.Coord{Q: 1}, OwnerID: "p1"})
	s.Players[0].ControlMarkersPlaced = 1
	if retained {
		eliminatePawn(s, f.actor, gd)
	}
	return f
}
func broadcastTarget() *domain.Coord { return &domain.Coord{Q: 1} }
func TestBroadcastBilingualGeometryAndSharedRebootEvidence(t *testing.T) {
	f := broadcastFixture(t, true)
	b, _ := f.gd.BlockByID("clandestine-broadcast")
	if b.Provisional || b.IsCentralCore || !slices.Equal(b.IceFaces, []int{2, 6}) || !reflect.DeepEqual(b.BoundarySpaces, [][]string{{"broadcast"}, {"broadcast"}, {"right"}, {"left"}, {"broadcast"}, {"broadcast"}}) || !reflect.DeepEqual(b.BonusCorners, []bool{false, false, false, false, false, false}) || b.Spaces[0].Capacity != domain.UnlimitedCapacity || b.Spaces[1].Capacity != 1 || b.Spaces[2].Capacity != 1 || !slices.Equal(b.Spaces[0].ZoneIDs, []string{"h1", "h2", "h3", "h4", "h7"}) || b.Effects.UnderControl.Kind != "controller-core" || b.Effects.UnderControl.Target != "broadcast" {
		t.Fatal("printed attributes", b)
	}
	initial := Snapshot(f.s)
	options := AvailableActions(f.s, f.gd)
	destinations := RebootDestinations(f.s, f.gd, "p1", f.actor)
	r := antroAccept(t, f, Action{Type: ActPlayRebootCard, PawnID: f.actor, CardID: "move-1", Coord: broadcastTarget(), SpaceID: "broadcast"})
	view, err := PlayerView(f.s, f.gd, "p2")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"initial": initial, "options": options, "destinations": destinations, "finished": Snapshot(f.s), "view": view, "events": r.Events})
	var got, want any
	_ = json.Unmarshal(raw, &got)
	_ = json.Unmarshal([]byte(readGolden(t, "broadcast.json")), &want)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Broadcast shared byte snapshots/options/events mismatch", string(raw))
	}
}
func TestBroadcastOptionsPureDetachedAndFollowController(t *testing.T) {
	f := broadcastFixture(t, true)
	before := Snapshot(f.s)
	rng := *f.s.RNG
	coords := []domain.Coord{}
	for _, o := range AvailableActions(f.s, f.gd) {
		if o.Action.Type == ActPlayRebootCard && o.Action.CardID == "move-1" {
			coords = append(coords, *o.Action.Coord)
		}
	}
	if !reflect.DeepEqual(coords, []domain.Coord{{}, {Q: 1}}) || len(AvailableActions(f.s, f.gd, "p2")) != 0 {
		t.Fatal("Reboot options", coords)
	}
	d := RebootDestinations(f.s, f.gd, "p1", f.actor)
	d[1].Coord.Q = 999
	after := *f.s.RNG
	if Snapshot(f.s) != before || after.Intn(100000) != rng.Intn(100000) {
		t.Fatal("preview mutated state/RNG")
	}
	block := f.s.Cybernet.At(domain.Coord{Q: 1})
	block.OwnerID = "p2"
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.Players[1].ControlMarkersPlaced = 1
	if len(RebootDestinations(f.s, f.gd, "p1", f.actor)) != 1 || len(RebootDestinations(f.s, f.gd, "p2", f.actor)) != 2 {
		t.Fatal("permission did not transfer")
	}
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayRebootCard, CardID: "move-1", PawnID: f.actor, Coord: broadcastTarget(), SpaceID: "broadcast"})
	f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = ""
	if len(RebootDestinations(f.s, f.gd, "p2", f.actor)) != 1 {
		t.Fatal("neutral permission")
	}
}
func TestBroadcastRebootCostsDuplicatesConservationAndOriginalDefault(t *testing.T) {
	f := broadcastFixture(t, true)
	inventory := sprawlInventory(f.s)
	rng := *f.s.RNG
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayReboot, PawnID: f.actor, Coord: broadcastTarget(), SpaceID: "broadcast", CardIDs: []string{"move-2", "move-2", "move-2", "dj"}})
	antroAccept(t, f, Action{Type: ActPlayReboot, PawnID: f.actor, Coord: broadcastTarget(), SpaceID: "broadcast", CardIDs: []string{"move-1", "move-2", "move-2", "dj"}})
	after := *f.s.RNG
	if !slices.Equal(f.s.Discard, []string{"move-1", "move-2", "move-2", "dj"}) || slices.Contains(f.s.Eliminated, f.actor) || !slices.Equal(inventory, sprawlInventory(f.s)) || rng.Intn(100000) != after.Intn(100000) {
		t.Fatal("payment/conservation")
	}
	old := broadcastFixture(t, true)
	antroAccept(t, old, Action{Type: ActPlayRebootCard, PawnID: old.actor, CardID: "move-1"})
	if old.s.Cybernet.PawnByID(old.actor).Coord != (domain.Coord{}) || !slices.Equal(old.s.PlayedCards, []string{"move-1"}) {
		t.Fatal("original default")
	}
	free := broadcastFixture(t, true)
	pawn, _ := free.gd.PawnByID(free.actor)
	for i := range pawn.Abilities {
		if pawn.Abilities[i].Ability == "reboot" {
			pawn.Abilities[i].Activation = "once-per-turn"
		}
	}
	count := 0
	for _, o := range AvailableActions(free.s, free.gd) {
		if o.Action.Type == ActReboot {
			count++
		}
	}
	if count != 2 {
		t.Fatal("free destination options")
	}
	antroAccept(t, free, Action{Type: ActReboot, PawnID: free.actor, Coord: broadcastTarget(), SpaceID: "broadcast"})
	eliminatePawn(free.s, free.actor, free.gd)
	restrictionReject(t, free.s, free.gd, Action{Type: ActReboot, PawnID: free.actor, Coord: broadcastTarget(), SpaceID: "broadcast"})
	if len(free.s.Players[0].Hand) != 5 {
		t.Fatal("free activation spent cards")
	}
}
func TestBroadcastInvalidAuthorityDestinationsPhasesAndPendingRejectAtomically(t *testing.T) {
	f := broadcastFixture(t, true)
	for _, a := range []Action{{Coord: broadcastTarget()}, {SpaceID: "broadcast"}, {Coord: broadcastTarget(), SpaceID: "right"}, {Coord: &domain.Coord{Q: 99}, SpaceID: "broadcast"}, {Coord: &domain.Coord{}, SpaceID: "broadcast"}} {
		a.Type = ActPlayRebootCard
		a.CardID = "move-1"
		a.PawnID = f.actor
		restrictionReject(t, f.s, f.gd, a)
	}
	for _, a := range []Action{{Type: ActPlayRebootCard, CardID: "worm", PawnID: f.actor}, {Type: ActPlayRebootCard, CardID: "move-1", PawnID: f.target}, {Type: ActPlayRebootCard, CardID: "move-1", PawnID: f.actor, PlayerID: "p2"}} {
		restrictionReject(t, f.s, f.gd, a)
	}
	f.s.Phase = domain.PhaseBeginning
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayRebootCard, CardID: "move-1", PawnID: f.actor})
	f.s.Phase = domain.PhaseAction
	f.s.PendingChoice = &domain.PendingChoice{ID: "test", Kind: "place-block", PlayerID: "p1", EffectID: "test", PawnID: f.actor, BlockID: "clandestine-broadcast", Reference: &domain.Coord{}}
	restrictionReject(t, f.s, f.gd, Action{Type: ActPlayRebootCard, CardID: "move-1", PawnID: f.actor})
}
func TestBroadcastDefenseOccupancyMovementAndLossOfPermission(t *testing.T) {
	f := broadcastFixture(t, false)
	p := f.s.Cybernet.PawnByID(f.actor)
	p.Coord = domain.Coord{Q: 1}
	p.SpaceID = "broadcast"
	defense, err := DefenseProfile(f.s, f.gd, p)
	if err != nil {
		t.Fatal(err)
	}
	for _, face := range []int{3, 4} {
		if !slices.ContainsFunc(defense, func(d domain.DefenseDie) bool { return d.Value == face && d.Shielded }) {
			t.Fatal("printed shielding")
		}
	}
	if !slices.ContainsFunc(StepTargets(f.gd, f.s.Cybernet, p.Coord, p.SpaceID, f.actor), func(r SpaceRef) bool { return r.SpaceID == "right" }) {
		t.Fatal("normal entry")
	}
	other := f.s.Cybernet.PawnByID(f.target)
	other.Coord = p.Coord
	other.SpaceID = "right"
	if CanEndOn(f.gd, f.s.Cybernet, p.Coord, "right", f.actor) == nil || CanEndOn(f.gd, f.s.Cybernet, p.Coord, "broadcast", f.actor) != nil {
		t.Fatal("normal/special capacity")
	}
	f.s.Cybernet.At(p.Coord).OwnerID = "p2"
	clone := CloneState(f.s)
	clone.Cybernet.At(p.Coord).OwnerID = "p1"
	if p.SpaceID != "broadcast" || p.Coord != (domain.Coord{Q: 1}) || f.s.Cybernet.At(p.Coord).OwnerID != "p2" {
		t.Fatal("control loss relocated pawn or clone aliased")
	}
	// Optional Core use does not relabel the physical tile for Lima Flag's entry ban.
	at := slices.Index(f.s.Deck, "lima-flag")
	if at < 0 {
		t.Fatal("missing physical Lima Flag")
	}
	f.s.Deck = slices.Delete(f.s.Deck, at, at+1)
	p.Attachments = []domain.Attachment{{CardID: "lima-flag", Slot: "add-on", SlotRef: "pawn:add-on"}}
	if MovementEntryError(f.gd, f.s.Cybernet, f.actor, p.Coord, domain.Coord{}) == nil || MovementEntryError(f.gd, f.s.Cybernet, f.actor, domain.Coord{}, p.Coord) != nil {
		t.Fatal("optional permission changed physical Core identity")
	}
}
func TestBroadcastSearchCaptureAndLastMarkerVictory(t *testing.T) {
	f := broadcastFixture(t, false)
	f.s.Cybernet.Blocks = f.s.Cybernet.Blocks[:1]
	f.s.Players[0].ControlMarkersPlaced = 0
	f.s.BlockPile = append(f.s.BlockPile, "clandestine-broadcast")
	antroAccept(t, f, Action{Type: ActPlaySearch, PawnID: f.actor, CardID: "dj"})
	antroAccept(t, f, Action{Type: ActResolveChoice, ChoiceID: f.s.PendingChoice.ID, OptionID: "place:0:0"})
	if f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "" || len(RebootDestinations(f.s, f.gd, "p1", f.actor)) != 1 {
		t.Fatal("placement granted control")
	}
	antroAccept(t, f, Action{Type: ActPlayMove, PawnID: f.actor, CardID: "move-2", Path: []SpaceRef{{Coord: domain.Coord{Q: 1}, SpaceID: "left"}, {Coord: domain.Coord{Q: 1}, SpaceID: "broadcast"}}})
	f.s.RNG = domain.NewRNG(1)
	r := antroAccept(t, f, Action{Type: ActPlayIcebreakBlk, PawnID: f.actor, CardID: "worm", Coord: broadcastTarget()})
	if f.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID != "p1" || len(RebootDestinations(f.s, f.gd, "p1", f.actor)) != 2 || !slices.ContainsFunc(r.Events, func(e EngineEvent) bool { return e.Type == EventControlChanged }) {
		t.Fatal("capture permission")
	}
	v := broadcastFixture(t, false)
	v.s.Cybernet.At(domain.Coord{Q: 1}).OwnerID = "p2"
	v.s.Players[0].ControlMarkersTotal = 1
	v.s.Players[0].ControlMarkersPlaced = 0
	v.s.Players[1].ControlMarkersPlaced = 1
	p := v.s.Cybernet.PawnByID(v.actor)
	p.Coord = domain.Coord{Q: 1}
	p.SpaceID = "broadcast"
	v.s.RNG = domain.NewRNG(1)
	antroAccept(t, v, Action{Type: ActPlayIcebreakBlk, PawnID: v.actor, CardID: "worm", Coord: broadcastTarget()})
	if v.s.WinnerID != "p1" || v.s.Players[1].ControlMarkersPlaced != 0 || len(AvailableActions(v.s, v.gd)) != 0 {
		t.Fatal("last marker takeover victory")
	}
}
func TestBroadcastDescriptorValidationAndStrictHandlerAcceptance(t *testing.T) {
	for _, e := range []domain.BlockEffects{{InCybernet: &domain.BlockEffect{Kind: "controller-core", Target: "broadcast"}}, {UnderControl: &domain.BlockEffect{Kind: "controller-core", Target: "missing"}}, {UnderControl: &domain.BlockEffect{Kind: "controller-core", Target: "left"}}, {UnderControl: &domain.BlockEffect{Kind: "controller-core", Target: "broadcast", Amount: 2}}} {
		gd, err := data.LoadDefault("speedrunners")
		if err != nil {
			t.Fatal(err)
		}
		b, _ := gd.BlockByID("clandestine-broadcast")
		b.Effects = e
		if _, err := NewGame(Config{Data: gd, AllowProvisional: true, PlayerNames: []string{"A", "B"}, Seed: 42}); err == nil {
			t.Fatal("malformed permission accepted")
		}
	}
	gd, err := data.LoadDefault("speedrunners")
	if err != nil {
		t.Fatal(err)
	}
	gd.Blocks = slices.DeleteFunc(gd.Blocks, func(b domain.Block) bool { return b.ID != "central-core" && b.ID != "clandestine-broadcast" })
	gd.Pawns = slices.DeleteFunc(gd.Pawns, func(p domain.Pawn) bool { return !p.IsStarter })
	gd.Cards = nil
	gd.ControlCards = slices.DeleteFunc(gd.ControlCards, func(c domain.ControlCard) bool { return !c.IsStarter })
	s, err := NewGame(Config{Data: gd, PlayerNames: []string{"A", "B"}, Seed: 42})
	if err != nil || len(s.Cybernet.Blocks) != 1 {
		t.Fatal("strict handler", err)
	}
}
