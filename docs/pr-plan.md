# PR Plan — Upload Video Local-First Processing

## Summary

This pass implements Upload Video as a working browser-first local processing flow with queueing, MediaPipe pose extraction, overlay preview, and local artifact exports.

## Assumptions

- Studio is the web-first source of truth.
- Mobile runtime responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.
- No required backend video upload/storage/cloud compute in this pass.

## Non-goals

- no cloud queue/worker,
- no hosted artifact persistence or job history,
- no browser live coaching runtime,
- no contract-breaking package changes,
- no unrelated architecture rewrite.

## Scope

- Upload Video top-level page with drag/drop + multi-select input.
- Local queue state with queued/processing/completed/failed/cancelled status.
- Browser MediaPipe Pose Landmarker video-mode processing.
- Overlay preview player for completed jobs.
- Local artifact export (pose timeline JSON, analysis JSON, annotated WebM).
- Clear local-processing messaging (keep tab open, close/reload interrupts).

## Follow-up candidates (not included)

- optional cloud fallback execution,
- optional backend blob storage + persistence,
- optional Android handoff/import integration,
- optional multi-concurrency controls.
