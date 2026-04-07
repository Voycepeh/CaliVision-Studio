# System Overview

## Ecosystem split

- **Studio web (this repo):** Library, Drill Studio, Upload Video local-first analysis, Drill Exchange direction.
- **Android/mobile runtime client:** import/use portable drill files and run live coaching/runtime playback. <https://github.com/Voycepeh/CaliVision>

## Current platform posture

- local-first/mock-backed state for registry/publishing/discovery,
- Upload Video processing and artifact generation runs in-browser on user hardware,
- portable package contract remains canonical transport boundary,
- hosted backend/auth/storage remain future layers.
