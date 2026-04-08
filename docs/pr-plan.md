# PR Plan — Unify My drills with Version-Aware Lifecycle Foundations

## Summary

Refactor drill persistence and library UX from separate Drafts/My drills buckets to a single **My drills** library with a stable drill identity and version-aware lifecycle.

## Problem

The split between top-level Drafts and My drills creates duplicate entries, confusing promotion behavior, and broken edit flows where editing Ready/Published content can create unrelated drill records.

## Scope in this PR

- Single top-level **My drills** view for local library workflows.
- Drill identity + version snapshot repository seam (`drillId` + version records).
- Version status foundation (`draft` | `ready`) plus publish flag (`isPublished`).
- Edit flow foundation:
  - editing Ready/Published creates or resumes a Draft version under the same drill identity.
- Upload Video selection gate:
  - only Ready/Published-capable drills are selectable.
- Publish gate foundation:
  - only Ready versions are publishable.
- Version history foundation:
  - list version number/status/published/timestamp per drill.
- Readiness validator foundation:
  - title, drill type, phase presence, and pose data checks.

## Compatibility / migration posture

- This PR uses a compatibility adapter approach over existing local persistence seams (`draft` + registry storage), minimizing migration risk.
- Existing locally saved data remains accessible through the unified drill/version projection.
- Hosted persistence remains in compatibility mode while unified hosted drill/version tables land.

## Non-goals

- Full visual diff/comparison UI for versions.
- Full backend Exchange publishing redesign.
- Pose/scoring algorithm changes.
- Large Studio layout redesign.

Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

## Additional assumptions/non-goals for Upload Video camera capture v1 (April 8, 2026)

- Scope is mobile-browser camera capture with record-then-analyze workflow inside `/upload`.
- No full browser live coaching, no real-time in-motion overlays, and no background recording pipeline in this phase.
- No backend media upload/storage changes are introduced; local browser analysis remains the default behavior.
- Android runtime/live coaching remains in the dedicated mobile client: <https://github.com/Voycepeh/CaliVision>.
