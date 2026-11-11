# Shadowraiders data (partial component transcription)

Reserved for the Shadowraiders expansion content: blocks (with event / drone
threat spaces), Shadowraider + mercenary pawns, threat tokens, mission cards,
control cards, and the mode manifests (Shadowraiders / Chaos / Outbreak / Total
War).

See `DOCS/rules/shadowraiders.md` and `DOCS/roadmap.md` (Phase 3). Schema
extensions for threats and missions are already tracked under `spec/schema/`.

The repository now keeps explicit empty shells for:

- `control-cards.json`
- `threats.json` now contains the directly reviewed Guard drone from rulebook p.21.
- `missions.json`

Those files document the canonical structure the loaders expect while making it
clear that record-level transcription and provenance are still pending. Tracked
work remains in `tasks/BACKLOG.md`.

`loadThreats` / `LoadThreats` read the validated threat sidecar. A complete
expansion bundle and executable solo/team modes remain in T-PLAY-002.
