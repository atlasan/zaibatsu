---
title: Persistent Windows play launcher
type: reference
---
`start-play.bat` starts the local game through
`tools/block-editor/start-local.ps1`, using a hidden background process that
does not depend on an active chat terminal session. It checks
`/api/play/health` before starting another host. Logs are in
`tmp/play-server.stdout.log` and `tmp/play-server.stderr.log`.
