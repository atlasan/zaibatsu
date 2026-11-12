---
title: Verification stays on this machine
type: decision
---
The repeatable verification recipe is `.github/localonly_workflows/verify.yml`. It sits outside `.github/workflows/`, so GitHub Actions does not run it on push or pull request.

**Why:** The check list stays in the repository, and hosted execution stays off by location.

**How to apply:** Add new repeatable checks to that file and to the root README. Run the recipe locally. Do not move it back under `.github/workflows/` unless hosted execution is an explicit decision. Do not describe GitHub Actions as the current runner.
