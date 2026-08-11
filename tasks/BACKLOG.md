# Backlog

Ordered work list. Pull from the top. Every engine item must land on **both**
mirrors and keep `DOCS/parity.md` updated. Phase labels map to `DOCS/roadmap.md`.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `(go)`/`(ts)`/`(spec)`/`(docs)` = area.

## Done (Phase 0 — bootstrap)
- [x] Umbrella workspace, `.gitignore`, `.editorconfig`, root `README`, `AGENTS.md`.
- [x] Shared `spec/schema` (block, pawn, action-card, mode) + provisional `spec/data/speedrunners`.
- [x] Docs: architecture, domain-model, turn-flow, glossary, parity, roadmap, rules digests.
- [x] Go + TS mirror engines: domain, data loader, seeded RNG, setup, turn loop, win detection.
- [x] Tests green on both sides; demos produce bit-identical games from a seed.
- [x] Project memory (`MEMORIES/`).

## Now (Phase 1 — core rules resolution)
- [x] (go/ts) Cybernet model: place blocks with hex adjacency + edge/space connectivity + valid orientation (Search). *Axial coords, `PlaceBlock`/`CanPlace`/`ValidPlacements`, Central Core seeded at origin; mirrored + tested.*
- [x] (go/ts) Pawn positions on the board + occupancy + movement budget + hex movement. *`PawnOnBoard` on Cybernet, pawns start on core, space capacity by type, `ResolveSteps` (fixed/d6/2d6/hex+modifiers, seeded), `CanActivateMovement`, `CanEndOn`, `MoveHex`; d6 sequence verified identical across mirrors (seed 99).*
- [ ] (spec + go/ts) **Space-adjacency schema + space-to-space movement.** Extend the block schema so each space lists intra-block neighbors and each edge maps to its boundary space(s); then execute steps/d6/2d6 movement over the space graph (pass-through vs end-on capacity, unused steps lost, no interleaving). *Currently only hex movement executes; step budgets already resolve.*
- [ ] (spec) Add JSON-Schema validation to the loaders (or a `spec/validate` step) so bad data fails loudly, not silently.
- [ ] (go/ts) Action-card **use choice** as first-class actions (move / activate / attach / discard-to-search / discard-4-to-reboot).
- [~] (go/ts) Ability resolution (**T-104**): Search, Delete, Reboot, Icebreaker.
  - [x] Delete + combat: attack roll (1 d6/skull) vs unshielded defense dice, single-target elimination, `Eliminated` pool, once-per-turn gating. *Full pipeline verified identical across mirrors (seed 123 → roll [2,4]).*
  - [x] Icebreaker: roll d6 vs target ICE faces → gain control (block: place/steal a control marker → real win path; pawn: change owner); Black-ICE-fail eliminates the attacker. *Block control tracked on `PlacedBlock.OwnerID`; ICE faces derived from category (provisional). Identical across mirrors (seed 5 → [6], success).*
  - [ ] Search: draw top of block pile + place via `PlaceBlock` (wire the pile draw).
  - [ ] Reboot: return an eliminated pawn (from the `Eliminated` pool) to the Central Core.
  - [ ] Replace provisional `IceFaces` with real per-block/pawn ICE die faces once transcribed (enables exact ICE-value modifier redundancy).
  - [ ] Multi-target Delete (split dice across co-located targets) + area attacks.
- [ ] (go/ts) Bonus fragments → bonus icons → bonus counters; card costs paid in bonus counters.
- [ ] (go/ts) Card attachment: slots, class grants, discard-on-loss rules.
- [ ] (docs) Update domain-model + parity as each lands.

## Next (Phase 2 — full Speedrunners content)
- [ ] (spec) Transcribe 24 blocks from `Sp 01 Blocks` + rulebook; replace provisional blocks.
- [ ] (spec) Transcribe 16 pawns from `Sp 02 Control Cards`; replace provisional pawns.
- [ ] (spec) Transcribe the 54-card action deck from `Sp 03 Action Cards`.
- [ ] (spec) Transcribe the 18 control cards.
- [ ] (go/ts) Effect registry keyed by effect id; implement every block/pawn/card effect.
- [ ] (go/ts) Golden-game tests: scripted games with asserted end states, cross-checked between mirrors.
- [ ] Resolve the opening-hand deal ambiguity against the physical rulebook (currently provisional p1→3,p2→4,p3→5,p4→6).

## Later (Phase 3 — Shadowraiders expansion)
- [ ] (spec) Schema extensions: threats (attack die, type), event/drone spaces, missions (tags), medals, Black ICE on pawns, merc cost.
- [ ] (spec) Transcribe Shadowraiders blocks, pawns, action cards, mission deck, Central Core 02.
- [ ] (go/ts) Threat activation + combat (attack dice vs defense), stealth movement, threat tokens as bonus counters.
- [ ] (go/ts) Mission cards: attach, tag tracking (mark/cargo/counter), rewards (medals / pawn control).

## Later (Phase 4 — game modes)
- [ ] (spec) Mode manifests: Shadowraiders, Chaos, Outbreak, Total War (+ alternate rule sets).
- [ ] (go/ts) Mode framework: setup recipes + win/lose condition registry.
- [ ] (go/ts) Solo AIs: Chaos and Outbreak turn logic.

## Later (Phase 5 — targets)
- [ ] (ts) Web target: render the Cybernet, drive the engine via actions.
- [ ] (go) Headless engine host / server + simulation harness.
- [ ] (go/ts) Bot players + batch self-play for balance analysis.
- [ ] (both) Grow the CLI demos into playable hotseat clients.

## Cross-cutting / tech debt
- [ ] Extract the shuffle-order sequence into a documented "setup RNG protocol" so future setup steps preserve cross-mirror parity.
- [ ] CI: run `go test`, `bun test`, `tsc`, and a demo-parity check (Go vs TS output must match) on every change.
- [ ] Decide and add `LICENSE` for engine code (game remains CC BY-NC 2.5 MX).
- [ ] Consider a JSON snapshot format for `GameState` to diff Go vs TS states directly.
