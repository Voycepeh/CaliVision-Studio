# Product Direction

CaliVision Studio product direction is organized around canonical web IA:

- **Dashboard (`/library`)** is the default workspace route.
- **Drills** spans **Drill Library (`/library`)** and **Drill Studio (`/studio`)**.
- **Analysis (`/upload`)** is the first-class Upload Analysis route.
- **Compare (`/live`, current posture)** carries benchmark-aware compare/review framing.
- **Drill Exchange (`/marketplace`)** remains supporting discovery/import workflow.
- **`/packages`** remains compatibility-only for technical routing and should not be a primary user entry.

Studio remains the source of truth for authoring/publishing. Mobile remains runtime/live coaching downstream: <https://github.com/Voycepeh/CaliVision>.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
