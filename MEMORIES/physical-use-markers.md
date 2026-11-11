---
title: Physical ability markers preserve ownership and attachment continuity
type: decision
---
Source states (introduced in v5, currently v7) store native use markers by control-card subject and equipped uses inside stable attachment instances; never refresh them by owner or array position. Beginning cleanup follows current card control after effects. Frozen regression retains its historical keys.

**How to apply:** follow ADR-0012/SR-MOVE-005. A marked discarded attachment retains metadata in `unresolvedUseCards`, not another inventory zone. Discard/redraw marker removal and full physical deck/hand copy identity remain T-RULES-021; affected reattachment and strict official limited-use bundles reject. Do not invent a reset or claim the subsystem complete.
