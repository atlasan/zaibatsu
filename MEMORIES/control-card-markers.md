---
title: Physical control-card marker allocations
type: reference
---
Counted markers on control cards live in GameState.controlCardMarkers, separately from bonus and ability-use markers. Actual acquisition uses GainPawnControl/gainPawnControl; zone synchronization alone uses SetPawnControl/setPawnControl. Source protocol is v9. Idoru printed facts include no class/ability and ICE1/6, but her full record stays provisional under SR-PAWN-004/T-RULES-023/025. Common retention is an experimental literal reading, marked same-owner reacquisition rejects, and marker removal/refill must not be guessed. See DOCS/adr/0015-control-card-marker-allocations.md and the owning rule module.
