---
title: Face-up played cards recycle with their paying player
type: decision
---
EN/ES p8 keeps a played card until the recycling phase of the paying player's turn. Parallel playedCardOwners metadata allocates the existing physical playedCards zone by index, preserving order and duplicates through other turns, pawn takeover and elimination. Source payments outside action phase stay face up too; explicit Search/four-card Reboot discards remain immediate. Only the recycling player's allocations discard. Snapshot, clone, view and replay preserve owners; invalid present allocations reject atomically. Metadata is not another physical zone and does not resolve T-RULES-021 attached-card identity/use-marker reuse. See [ADR-0025](../DOCS/adr/0025-any-player-turn-abilities-and-played-card-owners.md) and SR-TURN-009. Frozen regression keeps historical shared recycling.
