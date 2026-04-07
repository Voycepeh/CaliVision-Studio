# Product Direction

CaliVision Studio product direction is organized around a drill-first IA:

- **Home (`/`)** is the brand-first landing route.
- **Library (`/library`)** is the primary drill workspace for new drill creation, drafts, saved drills, and Studio entry.
- **Drill Studio (`/studio`)** is the focused editing workspace for a drill draft.
- **Upload Video (`/upload`)** is a first-class browser route for analysis workflows.
- **Drill Exchange (`/marketplace`, user-facing label)** is discovery/sharing direction.
- **`/packages`** remains compatibility-only for technical routing and should not be a primary user entry.

Studio remains the source of truth for authoring/publishing. Mobile remains runtime/live coaching downstream: <https://github.com/Voycepeh/CaliVision>.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.

