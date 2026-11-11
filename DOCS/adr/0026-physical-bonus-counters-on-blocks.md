# ADR-0026: Physical Bonus counters held on blocks

- Status: accepted
- Date: 2026-11-11
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [counter rules](../rules/speedrunners/setup-and-victory.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Arms Industry places one Bonus counter on itself and transfers that counter on control. A block counter is a different physical board allocation from a three-block Bonus icon, and its printed center is not a movement space.

## Decision

Represent a public optional bonusCounter on PlacedBlock. Presence means the placement happened; an empty collectedBy means the piece is still held, while a populated value records its first recipient after transfer. Extend shared effect identifiers with an exact placement1/control-collection pair; use typed handlers in both engines. Include held block counters in the existing pool's onBoard total, preserving the physical24-counter supply and detached snapshots/clones/player views.

Before placement, preview the combined cost of new Bonus icons and this block's allocation. Allocate icons before placement effects. During successful control, record control then icon transfer before the block transfer, keeping semantic event order equal to execution order. Collect the existing piece without reserve funding; never mint another on takeover. Stop the under-control effect on immediate victory. Reject duplicate placement, corrupt allocation and malformed pairs atomically.

Reserve exhaustion remains unsourced under T-RULES-031. Arms Industry therefore remains provisional and strict official construction rejects its mechanics even if the provisional flag is removed. Funded implementation is complete and tested; it does not establish a shortage or replacement-counter rule.

## Evidence

EN/ES block p6 tile1 and bilingual reserve/space/control/Black ICE/counter rules;11 mirrored tests and golden/arms-industry.json; sandbox counter/inspector/replay/recovery/Undo/reset; editor effect pairing. Source protocol/checksum is v20/block-bonus-counters;28 source evidence generators refresh and22 frozen files retain their original bytes. Full corpus/setup/modes remain separate.