---
title: Preserve the exact provisional regression corpus
type: decision
---
The pre-promotion mixed corpus, schemas, validation manifest and goldens are
frozen under `spec/fixtures/provisional-v1/`. Explicit regression loaders mark
their returned mode experimental without changing those files. Git preserves
their exact bytes, including CRLF hashes.

**Why:** [ADR-0006](../DOCS/adr/0006-source-promotion-and-phase-decisions.md)
preserves reproducible historical scenarios while canonical source data changes.

**How to apply:** never regenerate or normalize frozen inputs during promotion;
run `bun tools/verify-regression.ts`. Source-review fixtures opt into provisional
content explicitly, and official constructors continue to reject it.

Regression loaders now set the explicit `RegressionFixture` / `regressionFixture` marker. Source constructors now use `rulesVersion: source-v13` with physical pawn/card zones and rooted attachment slots; never infer historical semantics from a provisional record or an alias. [ADR-0007](../DOCS/adr/0007-source-lifecycle-and-replacement-windows.md) extends the compatibility boundary without changing the frozen bytes.

[ADR-0008](../DOCS/adr/0008-physical-attachment-slots.md) adds explicit physical slot locations and a source rules stamp in replay checksums. Refresh source evidence for this protocol; never refresh frozen regression evidence.

[ADR-0010](../DOCS/adr/0010-search-decisions-and-source-protocol-v3.md) advances source state/checksum semantics to v3 for committed Search decisions. Regenerate only source evidence; previous source traces must fail clearly and frozen traces must keep their original outcomes.

[ADR-0011](../DOCS/adr/0011-rolled-movement-decisions.md) advances source state/checksums to v4 for public movement rolls and subsequent path decisions. Frozen traces and bytes retain their original semantics; refresh source evidence only.

[ADR-0018](../DOCS/adr/0018-public-global-sacrifice-decisions.md) advances source state/checksum semantics to v11 for public global pawn-sacrifice commitments. Preserve frozen bytes and reject incompatible v10 source traces explicitly.

[ADR-0019](../DOCS/adr/0019-physical-bonus-counter-reserve.md) advances source state/checksums to v12 for the finite bonus supply and physical icon counters. Historical frozen states omit the supply and retain old behavior; source-v11 traces reject explicitly.

[ADR-0021](../DOCS/adr/0021-native-pawn-phase-effects-and-controlled-placement.md) advances source state/checksums to v13 for native pawn phase choices and transfer visibility. Refresh only source evidence; v12 source traces reject explicitly and frozen bytes/outcomes remain unchanged.
