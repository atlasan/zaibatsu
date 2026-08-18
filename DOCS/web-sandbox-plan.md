# Local Speedrunners rules sandbox

## Outcome

`tools/block-editor` serves `/play/`, a local-only Speedrunners rules and
debugging surface. The browser never reads the filesystem or changes canonical
content. It receives a render-safe projection from the Bun host; the host loads
the shared data and executes the TypeScript mirror in isolated in-memory
sessions.

This is not a hotseat client, a network service, or a production asset
distribution channel. Shadowraiders, accounts, persistence, multiplayer, and
public hosting remain outside this workstream.

## Contract

- A session is `{ playerNames, seed, accepted commands }`; it can be reset,
  replayed, undone, exported, and imported deterministically.
- A trace includes its setup, accepted phase/action command log, and a checksum
  over the local Speedrunners data inputs. An import with a different checksum
  is rejected before replay.
- Engine transitions return structured events (`phase-advanced`, accepted
  action, roll, draw, elimination, control change, winner, or validation
  failure). UI text is presentation only; it never parses engine messages.
- The CSS tactical board is the guaranteed rendering path. A local,
  checksum-pinned artifact may be layered behind it when available through the
  existing artifact endpoint; missing artwork is silent and harmless.

## Local play flow

1. Create a seeded 2–4 player session and click **Start action phase**.
2. The guided-action selector prefers a legal Search when the active hand can
   pay for it. Choose its shown direction/rotation, then execute it to add the
   top block from the pile to the Cybernet.
3. **Pass & end turn** records a pass, runs recycle (drawing to the hand limit),
   resolves end, and starts the next player. The individual phase button remains
   available for rules debugging.
4. A hex-moving pawn (currently the Yellow Speedrunner in the base data) gets
   only directions that contain a placed neighboring block. Once-per-turn
   `steps`/`d6`/`2d6` pawns receive a guided path builder backed by the
   server's non-mutating adjacency projection. Fixed paths show their exact
   budget; dice paths show their maximum while the actual seeded roll remains
   engine-authoritative on submission. A movement-valued card gets the same
   path builder with its printed fixed budget and is discarded only after the
   engine accepts the path.

## Acceptance gate

The full sandbox acceptance claim is allowed only when Speedrunners has complete
supported-action coverage, accepted source/data readiness, and green Go/TS
golden fixtures. Until then this route is an engineering/debug surface for the
implemented action subset; it must not imply source-complete gameplay.

Before closing the workstream, run `bun tools/validate-docs.ts`,
`bun tools/verify-artifacts.ts`, `bun tools/validate-spec.ts`, the Bun suites,
and the Go suites. Keep the transition/event API and its tests mirrored; see
[the parity contract](parity.md) and [the lifecycle](lifecycle.md).

## Interface ownership

The Go and TypeScript engines own phase transitions, structured transition
events, action validation, and canonical snapshots. `tools/block-editor/play.ts`
owns only local session orchestration and trace replay. `/play/` owns browser
rendering and guided input. `DOCS/parity.md` records the cross-language mapping;
`tasks/BACKLOG.md` owns the remaining ordered readiness work.
