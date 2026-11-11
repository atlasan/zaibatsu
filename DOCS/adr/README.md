# Architecture decision records

ADRs preserve decisions that materially constrain future work. They are
immutable once accepted except for status and links to a superseding ADR.

## Lifecycle

1. Copy [TEMPLATE.md](TEMPLATE.md) to the next zero-padded number.
2. Propose the decision with alternatives and consequences.
3. Mark it **accepted** only when the decision is adopted.
4. Link related rules, schemas, tasks, parity entries and memories.
5. If the decision changes, create a new ADR and mark the old one
   **superseded by ADR-NNNN**; do not rewrite history.

## Register

| ADR | Status | Decision |
|-----|--------|----------|
| [0001](0001-mirror-implementations.md) | accepted | Go and TypeScript are independent mirrors over one shared specification |
| [0002](0002-data-driven-game-rules.md) | accepted | Game content is declarative shared data, not engine code |
| [0003](0003-seeded-determinism.md) | accepted | All game randomness uses the shared seeded RNG protocol |
| [0004](0004-documentation-governance.md) | accepted | Govern documentation through a registry and structured ruleset |
| [0005](0005-local-quick-match.md) | accepted | An explicit provisional four-marker profile supports local matches while official Speedrunners remains source-gated |
| [0006](0006-source-promotion-and-phase-decisions.md) | accepted | Preserve frozen regression evidence, gate official setup and represent phase decisions in both engines |
| [0007](0007-source-lifecycle-and-replacement-windows.md) | accepted | Version source lifecycle explicitly and preserve controller-owned elimination-replacement decisions |

| [0008](0008-physical-attachment-slots.md) | accepted | Preserve physical slot locations, provider-dependent cleanup and source protocol v2 |

| [0009](0009-player-views-and-trusted-snapshots.md) | accepted | Detached player views and event projections keep hidden information separate from trusted snapshots and local operator transport |

| [0010](0010-search-decisions-and-source-protocol-v3.md) | accepted | Commit Search activation before a public drawn-block placement decision; version source semantics as v3 |

| [0011](0011-rolled-movement-decisions.md) | accepted | Commit/publicize movement dice before an authorized path/stop choice; source protocol v4 |

| [0012](0012-physical-ability-use-markers.md) | accepted | Physical native/attachment use references, unresolved discarded-card evidence, and source protocol v5 |

| [0013](0013-zero-step-movement.md) | accepted | Spend zero-step fixed/card movement consistently with up-to-step rules; source protocol v6 |

| [0014](0014-neutral-pawn-placement-and-defense-spaces.md) | accepted | Match neutral pawn spaces, encode exact defense shielding/title zones and version source semantics as v7 |

| [0015](0015-control-card-marker-allocations.md) | accepted | Store counted control-card markers, separate acquisition from zone synchronization, and version source semantics as v8 |

| [0016](0016-internal-arrows-and-global-discard-decisions.md) | accepted | Directed internal space links, private authorized discard commitments, explicit provisional gaps and source protocol v9 |

| [0017](0017-optional-space-effects-and-acting-icebreaker.md) | accepted | Optional physical attachment decisions, acting Icebreaker modifiers and source protocol v10 |

| [0018](0018-public-global-sacrifice-decisions.md) | accepted | Public owner-authorized pawn commitments, sacrifice cleanup and source protocol v11 |

| [0019](0019-physical-bonus-counter-reserve.md) | accepted | Finite supply, physical on-icon counters, pure reserve derivation and source protocol v12 |

| [0020](0020-controller-core-permission.md) | accepted | Controller Core permission, pure destinations and compatible explicit Reboot actions |

| [0021](0021-native-pawn-phase-effects-and-controlled-placement.md) | accepted | Typed native choices, physical controlled placement, event-time transfer visibility and source protocol v13 |

| [0022](0022-optional-adjacent-block-attacks.md) | accepted | Controller target-before-roll block effects, authorized defender handoff and source protocol v14 |

| [0023](0023-marker-threshold-hand-discard-and-payment-timing.md) | accepted | Physical Cybernet thresholds, whole-hand effects after source payment, ordered control receipts and protocol v15 |

| [0024](0024-global-pawn-detachment-and-space-hand-limits.md) | accepted | Mandatory Cybernet pawn choices, all-attachment cleanup, current hand-space profiles and protocol v16 |

| [0025](0025-any-player-turn-abilities-and-played-card-owners.md) | accepted | Typed permitted-turn abilities, authorized public assignments and paying-player recycling |
| [0026](0026-physical-bonus-counters-on-blocks.md) | accepted | Physical block counters, ordered transfer and explicit reserve-shortage gate |
