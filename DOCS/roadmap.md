# Roadmap

Phased plan from the current bootstrap slice to full Zaibatsu + expansions +
targets. Each phase keeps **both mirrors** green and the **parity contract**
updated. Detailed, ordered tasks live in `tasks/BACKLOG.md`.

## Phase 0 — Bootstrap (done)
Umbrella workspace, shared `spec/` (schema + seed data), Go + TS mirror engines
with a working core slice: domain types, data loader, turn loop, marker counts,
hand refill, seeded RNG, win detection, tests on both sides.

## Phase 1 — Core rules resolution (Speedrunners)
- Tile placement: hex adjacency, edge/space connectivity, valid orientation.
- Bonus fragments → bonus icons → bonus counters.
- Movement resolution: steps, occupancy rules, `d6`/`2d6`/`hex`, modifiers.
- Ability resolution: Search, Delete (attack roll vs defense dice), Reboot,
  Icebreaker (roll vs ICE, Black ICE penalty), including control-marker placement.
- Action-card **use choice** (move / activate / attach / discard-to-search /
  discard-4-to-reboot) as first-class engine actions.
- Card attachment: slots, class grants, costs paid in bonus counters.

## Phase 2 — Full Speedrunners content
- Transcribe all 24 blocks, 16 pawns, 54 action cards, 18 control cards from the
  PDFs into `spec/data/speedrunners/` (replace provisional seed data).
- Encode every block/pawn/card effect; effect registry keyed by id.
- Golden-game tests: scripted games with asserted end states on both mirrors.

## Phase 3 — Shadowraiders expansion
- Structural shells for `control-cards`, `threats`, and `missions` already live
  under `spec/data/shadowraiders/`; this phase fills them with source-backed
  records.
- New primitives: threats (drone/token/mark/chaos), attack dice, event spaces,
  stealth movement, Black ICE on pawns, mercenary cost, medals.
- Mission cards + tags (mark/cargo/counter), rewards (medals / pawn control).
- Central Core 02 + direction die.
- Content: Shadowraiders blocks, pawns, action cards, mission deck.

## Phase 4 — Game modes
Data-driven mode definitions (setup, components required, win/lose conditions):
Speedrunners, Shadowraiders (2–4p), Chaos (solo), Outbreak (solo), Total War
(2–8p). A mode = a config + setup recipe + end-condition set over the same core.

## Phase 5 — Targets
- CLI player (both langs) — already the demo entry point; grow into a playable
  hotseat.
- Local web sandbox (TS): render the Cybernet, drive live engine phases via
  structured actions/events, and replay checksum-pinned traces. See
  [the sandbox workstream](web-sandbox-plan.md); public hosting remains later.
- Server/native/WASM (Go): headless engine host, bots, and simulation harness.
- Bots & simulation: AI players + batch self-play for balance analysis.

## Cross-cutting, always-on
- Parity kept in lockstep (`DOCS/parity.md`).
- Determinism (seeded RNG) preserved end-to-end.
- Rules ambiguities resolved in `DOCS/rules/*` with rationale.
- Mods/expansions kept as additive data + effect modules, never core forks.

Current Speedrunners delivery includes verified Combat Prototypes and Drone Probe native free Search/movement, with shared data, both mirrors, byte evidence and sandbox/editor acceptance. The ordered next item is Military Development / Drone Turret; full content, ordinary setup-to-victory and mode acceptance remain open. See [the execution checkpoint](engine-resume-plan.md) and [live backlog](../tasks/BACKLOG.md).

Speedrunners now includes verified Military Development/Drone Turret, typed permitted-turn ability execution and controller-owned played-card recycling, with shared data, both mirrors and sandbox/editor acceptance. Continue printed p6 tile1 after primary review. Full official setup-to-victory, remaining corpus and mode acceptance remain open; the latest checkpoint and backlog remain the ordered delivery owners.

Arms Industry's funded physical block-counter lifecycle is implemented in both mirrors and sandbox, with reserve exhaustion explicitly provisional. The [remaining-work snapshot](remaining-work.md) inventories outstanding components, interpretations, all official modes and UI/acceptance gates; the backlog remains the ordered live list.

Cleaner B at p6 tile2 is implemented in both mirrors and the sandbox: controlled placement of its one pawn and control card, the hand−1 space, unshielded defense faces 1 and 2, and the hand-to-circuit arrow. Next independent printed block is Cleaner A at p6 tile3. No official mode is accepted.
