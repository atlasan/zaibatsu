---
title: Two mirror implementations — Go + TS(Bun)
type: decision
---
The engine is built as two mirror implementations — `impl/go` (Go) and `impl/ts`
(TypeScript on Bun) — that stay in structural lockstep over one language-neutral
`spec/` (JSON Schema + data).

**Why:** the user asked for "two mirror base repos: go + js (bun)". Two mirrors
give a correctness cross-check (bugs surface as behavioral diffs), reach
different targets (Go → native/server/WASM; TS → web/Bun), and force clean
data-driven design.

**How to apply:** any engine change must land on both sides before it's done;
update `DOCS/parity.md`. The mirrors share `spec/` but never share code.
