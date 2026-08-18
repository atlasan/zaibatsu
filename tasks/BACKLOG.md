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
- [x] (spec + go/ts) **Space-adjacency schema + space-to-space movement.** Blocks encode intra-block neighbors and edge boundary spaces; both mirrors execute `steps`/`d6`/`2d6` paths with pass-through, end-on capacity, unused-budget, and no-interleaving rules. The Central Core's all-edge boundary mapping is retained as provisional inferred data until directly transcribed.
- [ ] (spec) Add JSON-Schema validation to the loaders (or a `spec/validate` step) so bad data fails loudly, not silently.
- [x] (go/ts) Action-card **use choice** (move / activate / attach / discard-to-search / discard-4-to-reboot).
  - [x] Activate abilities: `PlayDelete`, `PlayIcebreakBlock`/`PlayIcebreakPawn` (play a matching card), `PlaySearch` (discard 1), `PlayReboot` (discard 4). Card consumed→discard; illegal plays don't consume; verified identical across mirrors (seed 123).
  - [x] Activate movement by card: `PlayMove` / `playMove` uses the printed card budget, consumes only after a legal path, and leaves once-per-turn pawn movement available.
  - [x] Attach a card to a pawn/enemy/block element with slot, class, ICE, and bonus-cost checks; attached effect grants/removals remain tracked separately.
- [~] (go/ts) Ability resolution (**T-104**): Search, Delete, Reboot, Icebreaker.
  - [x] Delete + combat: attack roll (1 d6/skull) vs unshielded defense dice, single-target elimination, `Eliminated` pool, once-per-turn gating. *Full pipeline verified identical across mirrors (seed 123 → roll [2,4]).*
  - [x] Icebreaker: roll d6 vs target ICE faces → gain control (block: place/steal a control marker → real win path; pawn: change owner); Black-ICE-fail eliminates the attacker. *Block control tracked on `PlacedBlock.OwnerID`; ICE faces derived from category (provisional). Identical across mirrors (seed 5 → [6], success).*
  - [x] Search: draw top of block pile + place via `PlaceBlock` (`Search`, `SearchTopBlock`, `ValidSearchPlacements`; block consumed only on legal placement).
  - [x] Reboot: return an eliminated pawn (from the `Eliminated` pool) to the Central Core under the rebooting player's control.
  - [ ] Replace provisional `IceFaces` with real per-block/pawn ICE die faces once transcribed (enables exact ICE-value modifier redundancy).
  - [~] Multi-target Delete (split dice across co-located targets) + area attacks.
    - [x] `DeleteMulti`: roll one die per skull, assign one die per co-located target (up to skull count), distinct/self/co-location checks, once-per-turn gating. Identical across mirrors (seed 3 → [3,1]).
    - [ ] Concentrate multiple dice on one target; area attacks (Bomb class / block effects).
- [ ] (go/ts) Bonus fragments → bonus icons → bonus counters; card costs paid in bonus counters.
- [~] (go/ts) Card attachment: slots, class grants, discard-on-loss rules.
  - [x] Attach to pawn/enemy/block (`AttachToPawn`/`AttachToEnemy`/`AttachToBlock`): slot-present + slot-empty checks, block-needs-ICE, bonus-counter cost paid onto the card; `EffectivePawnClasses` folds in granted classes; attachments discarded (bonus refunded) on elimination and Icebreaker takeover. State verified identical across mirrors.
  - [ ] Apply attached effects in resolution: armor replaces defense dice & nullifies ICE; weapon/gadget/ability/movement grants; hand-size modifiers.
- [x] (go/ts) Unified action interface: `Action` tagged union + `Apply(state, gd, action)` reducer dispatching every ability/card/attach action; `RunTurn` drives a turn through it. `playerId` defaults to the current player. Verified identical across mirrors. *Connective tissue for UI / bots / golden-game harness.*
- [ ] (docs) Update domain-model + parity as each lands.

## Next (Phase 2 — full Speedrunners content)
- [x] (spec/docs) Source-verified 2017 product inventory, mode register, rights evidence, external source register, and cataloged Shadowraiders mode provenance. Individual component records remain provisional until directly transcribed.
- [ ] (spec) Transcribe 24 blocks from `Sp 01 Blocks` + rulebook; replace provisional blocks.
- [ ] (spec) Transcribe 16 pawns from `Sp 02 Control Cards`; replace provisional pawns.
- [ ] (spec) Transcribe the 54-card action deck from `Sp 03 Action Cards`.
- [ ] (spec) Transcribe the 18 control cards.
- [ ] (go/ts) Effect registry keyed by effect id; implement every block/pawn/card effect.
- [x] (go/ts) Golden-game tests: canonical `Snapshot(state)` (byte-identical across mirrors) + shared `golden/*.snap` fixtures that BOTH mirrors assert against (seed-42 whole game + seed-7 combat scenario). Whole-state cross-mirror equivalence check. Add scenarios as coverage grows.
- [x] Resolve the opening-hand deal ambiguity against the physical rulebook. *Verified as p1→3, p2→4, p3→5, p4→5 in the English and Spanish rulebooks; `spec/data/speedrunners/mode.json` and `spec/provenance/speedrunners.json` now reflect the sourced value.*

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
- [~] (tools/ts) Local Speedrunners rules sandbox: `/play/` is served by the
  block-editor host with isolated replayable sessions, CSS Cybernet projection,
  optional local artwork, live phase controls, and trace import/export. Close
  only after supported-action coverage, accepted source/data readiness, and
  both golden suites are green; see `DOCS/web-sandbox-plan.md`.
- [ ] (go) Headless engine host / server + simulation harness.
- [ ] (go/ts) Bot players + batch self-play for balance analysis.
- [ ] (both) Grow the CLI demos into playable hotseat clients.

## Cross-cutting / tech debt
- [x] (tools/spec/docs) Source-aligned 2-3-2 seven-hex model: standard placement anchors, 1-N space mapping, source-facing circle/capsule/compound display metadata, migration review gating, and mirror loading; source transcription and step-movement execution remain separate work.
- [x] (spec/tools/docs) Knowledge catalog foundation: canonical `spec/knowledge/` taxonomy + generated catalog/relations, validation hooks, workflow docs, and editor knowledge hints are now tracked in-repo.
- [~] (spec/docs) Speedrunners pilot verification slice: page-1 action cards and the first two page-1 blocks are source-linked through provenance and `gameplayRef`; continue the remaining block confirmations before expanding the workflow across the full set.
- [x] (tools/spec/docs) Reproducible artifact toolset: checksum-verified PDF render, automatic crop detection, PNG/WebP extraction, page atlases, ignored outputs, and source-linked asset-manifest contract. Gameplay mapping remains pending component transcription.
- [ ] Extract the shuffle-order sequence into a documented "setup RNG protocol" so future setup steps preserve cross-mirror parity.
- [x] (tools/editor/spec/docs) **Standalone block-editor MVP.** Local asset browser, source-linked draft form, validation, session save/reopen, and explicit patch/report export implemented under `tools/block-editor/`. It remains independent of the mirror engines.
- [ ] CI: run `go test`, `bun test`, `tsc`, and a demo-parity check (Go vs TS output must match) on every change.
- [ ] Decide and add `LICENSE` for engine code (game remains CC BY-NC 2.5 MX).
- [ ] Consider a JSON snapshot format for `GameState` to diff Go vs TS states directly.
- [x] (tools/spec/docs) Source-linked action-card automation: both English 54-card decks are cropped into the manifest; local review-only vision emits OCR/icon/duplicate candidates; the data editor supports v2 action-card drafts and provenance reports. No candidate directly changes canonical data or engine effects.
- [x] (tools/docs/spec) Tracked transcript corpus: rulebook and component-sheet transcripts for both games are generated from cataloged source PDFs under `DOCS/rules/transcripts/`, with raw extractor output kept in `tmp/ruletext/`.
