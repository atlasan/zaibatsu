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
- Web target (TS): render the Cybernet, drive the engine via actions.
- Server/native/WASM (Go): headless engine host, bots, and simulation harness.
- Bots & simulation: AI players + batch self-play for balance analysis.

## Cross-cutting, always-on
- Parity kept in lockstep (`DOCS/parity.md`).
- Determinism (seeded RNG) preserved end-to-end.
- Rules ambiguities resolved in `DOCS/rules/*` with rationale.
- Mods/expansions kept as additive data + effect modules, never core forks.
