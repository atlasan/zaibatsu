# Initial traceability matrix

This matrix is the lifecycle baseline while the legacy backlog is being
normalized. New tasks use the stable IDs below; work remains ordered by phase in
[the backlog](../../tasks/BACKLOG.md).

| Phase | Delivery evidence | Current task IDs |
|-------|-------------------|------------------|
| Bootstrap | ADR-0001/2/3, source catalog, provisional seed data, two mirror tests | T-001–T-007 |
| Core rules | transcript set + Speedrunners digest, shared schemas, Go+TS behavior/tests, parity | T-100–T-107 |
| Speedrunners content | component source locators, canonical data, effects, golden games | T-200–T-206 |
| Shadowraiders | expansion sources, schemas/provenance, mirrors and tests | T-300–T-303 |
| Modes | sourced mode manifests, setup/end-condition behavior and tests | T-400–T-402 |
| Targets | target-specific contracts over the verified core | T-500–T-503 |
| Cross-cutting | deterministic protocol, license, state snapshots | T-900–T-903 |

The current source-backed data status is **provisional**. No row becomes
implemented until both mirrors, `DOCS/parity.md`, and equivalent tests are
updated. CI is not part of this repository-preparation work.
