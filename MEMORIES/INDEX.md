# Project memory index

Durable decisions and context for the Zaibatsu project. One fact per file. This
index is the quick-scan map; open a file for detail. Keep entries one line.

**File format** (each `MEMORIES/*.md`):

```
---
title: <short title>
type: decision | domain | constraint | reference
---
<the fact. For decisions, add **Why:** and **How to apply:** lines.>
```

## Entries

- [local-play-launcher.md](local-play-launcher.md) — reference: persistent hidden Windows server launcher and local logs.

- [stack-two-mirrors.md](stack-two-mirrors.md) — decision: Go + TS(Bun) mirror engines over a shared spec.
- [data-driven-rules.md](data-driven-rules.md) — decision: game content lives as data in spec/, not code.
- [determinism-seeded-rng.md](determinism-seeded-rng.md) — constraint: all randomness via a seeded LCG shared across mirrors.
- [game-identity.md](game-identity.md) — domain: what Zaibatsu is (Speedrunners core + Shadowraiders expansion).
- [regression-corpus.md](regression-corpus.md) — decision: preserve exact frozen corpus bytes and require explicit experimental setup.
- [provisional-seed-data.md](provisional-seed-data.md) — constraint: canonical data mixes verified and provisional records; complete source/runtime coverage remains open.
- [verified-inventory-baseline.md](verified-inventory-baseline.md) — reference: source-verified 2017 release inventory and mode register; component records remain separate.
- [component-review-protocol.md](component-review-protocol.md) — constraint: consistently save every asset's transcription, details, actions and instructions.

- [player-view-boundary.md](player-view-boundary.md) — decision: player projections, continuous reveal and trusted operator transport are distinct contracts.

- [physical-use-markers.md](physical-use-markers.md) — decision: source physical ability references and explicit unresolved discarded-card reuse gate.

- [block-defense-symbols.md](block-defense-symbols.md) — constraint: primary square-die defense symbols and explicit title/art zones supersede old ICE observations.
- [control-card-markers.md](control-card-markers.md) — reference: counted card allocations, acquisition versus synchronization and unresolved Idoru lifecycle.

- [internal-space-arrows.md](internal-space-arrows.md) — decision: directed internal links are distinct from cross-edge Direction.

- [optional-space-effects.md](optional-space-effects.md) — decision: physical optional discard choices, cleanup and explicit Antro targeting/stop gaps.

- [global-sacrifice-choices.md](global-sacrifice-choices.md) — decision: owner-authorized public sacrifice selections and explicit unresolved policies.

- [physical-bonus-reserve.md](physical-bonus-reserve.md) — decision: derive source reserve from physical free/invested/on-icon allocations.

- [controller-core-permission.md](controller-core-permission.md) — decision: optional controller Reboot destinations remain separate from physical setup Core identity.

- [native-pawn-phase-effects.md](native-pawn-phase-effects.md) — decision: shared native queue/choices, physical theft and event-time privacy with explicit ordering gates.
- [control-card-assets.md](control-card-assets.md) — reference: shared core manifest and repeatable English control-card crops, with unique review accounting.

- [optional-adjacent-block-attacks.md](optional-adjacent-block-attacks.md) — decision: source target-before-roll block choices and authorized single-defender handoff.

- [marker-threshold-hand-discard.md](marker-threshold-hand-discard.md) — decision: physical Cybernet thresholds and source payment before remaining-hand effects.

- [global-pawn-detachment.md](global-pawn-detachment.md) — decision: mandatory global pawn targets and physical all-attachment cleanup.
- [current-space-hand-limits.md](current-space-hand-limits.md) — decision: stopped controlled-pawn space contributions to recycling and public profiles.

- [native-drone-source-bundles.md](native-drone-source-bundles.md) — decision: verified MK-2 content uses existing placement, native movement/combat and physical marker lifecycle.

- [native-free-search.md](native-free-search.md) — decision: independent native Search/movement markers, reveal-before-placement timing and hidden-safe eligibility.

- [any-player-turn-abilities.md](any-player-turn-abilities.md) — decision: controller-owned off-turn abilities and public assignments.
- [played-card-owners.md](played-card-owners.md) — decision: face-up physical cards recycle with their paying player.

- [physical-block-bonus.md](physical-block-bonus.md) — decision: physical held block counters, one-time transfer and reserve-policy gate.

- [cleaner-b-placement.md](cleaner-b-placement.md) — decision: Cleaner B reuses controlled placement; white faces are defense.
- [local-verification.md](local-verification.md) — decision: the verification recipe stays outside GitHub Actions and runs on this machine.
