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
- [ ] (spec) Add JSON-Schema validation to the loaders (or a `spec/validate` step) so bad data fails loudly, not silently.
- [ ] (go/ts) Cybernet model: place blocks with hex adjacency + edge/space connectivity + valid orientation (Search).
- [ ] (go/ts) Pawn positions on the board; movement resolution (steps / d6 / 2d6 / hex, occupancy, modifiers).
- [ ] (go/ts) Action-card **use choice** as first-class actions (move / activate / attach / discard-to-search / discard-4-to-reboot).
- [ ] (go/ts) Ability resolution: Search, Delete (attack roll vs defense dice), Reboot, Icebreaker (roll vs ICE, Black ICE penalty) incl. control-marker placement on Icebroken blocks.
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
