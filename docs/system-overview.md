# System Overview

## Ecosystem split

- **Studio web (this repo):** Home landing, Library drill workspace, Drill Studio draft editor, Upload Video local-first analysis, Drill Exchange direction.
- **Android/mobile runtime client:** import/use drill files/packages and run live coaching/runtime playback. <https://github.com/Voycepeh/CaliVision>

## Current platform posture

- drill-first UX language and route hierarchy,
- local-first/mock-backed state for registry/publishing/discovery,
- Upload Video processing and artifact generation runs in-browser on user hardware,
- portable package contract remains canonical engineering boundary,
- hosted backend/auth/storage remain future layers.

> Note (April 2026): Studio now has initial Supabase hosted-draft/auth groundwork; public Exchange/publishing and mobile runtime remain separate concerns (mobile runtime: https://github.com/Voycepeh/CaliVision).
