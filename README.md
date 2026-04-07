# CaliVision Studio

CaliVision Studio is the **web-first home** for:

- **Drill Studio** authoring,
- browser **Upload Video** local analysis,
- **Drill Exchange** discovery and sharing workflows,
- portable drill file import/export compatibility.

`/library` is the primary workspace start for drill creation and recovery. `/` remains the brand landing route.

Android/mobile runtime client (downstream consumer): <https://github.com/Voycepeh/CaliVision>.

## Product flow (current UX)

1. Start in **Library** (`/library`) to create a new drill, continue drafts, import drill files, and browse shared drills.
2. Use **Drill Studio** (`/studio`) to edit the currently selected drill (metadata, phases, source images, pose detection/refinement, animation preview, and review).
3. Use **Upload Video** (`/upload`) for browser-local video analysis and artifact downloads.
4. Use **Exchange** (`/marketplace`) for discovery, sharing, and fork/remix direction (currently local/mock-backed).

## Current capabilities

- create drill drafts,
- edit metadata/phases,
- upload phase image,
- detect/refine pose,
- preview animation,
- export Android-compatible drill file,
- process local upload videos in-browser and download:
  - Pose Timeline (.json),
  - Processing Summary (.json),
  - Annotated Video export (WebM).

## Branding assets (homepage + app shell)

- Primary homepage and navbar logo asset: `public/brand/calivision-home-logo.svg`.
- Temporary app icon placeholder for Next.js app router: `src/app/icon.svg`.
- Current implementation intentionally reuses the same branding family while we prepare dedicated tiny-size icon artwork.

## Engineering note on drill files

The portable drill package/file format is still maintained for portability, Android compatibility, and future schema evolution/migration.

## Upload Video local-first constraints

- processing runs on this browser/device,
- no mandatory backend upload/storage/worker,
- keep the tab open while jobs run,
- closing/reloading interrupts jobs,
- switching tabs can slow processing.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Draft and My drills persistence (current)

Drill Studio autosaves working drafts to browser-local IndexedDB so edits survive refresh, tab close, and reopen on the same device/browser.

- **Drafts** are work in progress.
- **My drills** are saved drills.
- Signed out: Drafts and My drills are stored on this browser/device.
- Signed in: Drafts and My drills are account-hosted first, with browser-local safety fallback.
- **Export drill**: portable file for import/share and Android runtime client workflows: <https://github.com/Voycepeh/CaliVision>.
- Library owns file-management actions (import/export/save copy/delete/open in Studio).
- **Publish**: still local/mock for now; hosted sync/auth/storage is intentionally deferred.

## Hosted drafts foundation (April 2026)

CaliVision Studio now includes an initial Supabase-backed hosted slice for **auth + user-owned drafts/My drills + hosted asset groundwork** while preserving browser-local draft resilience.

- Local IndexedDB drafts continue to autosave for resilience.
- Hosted mode requires Google sign-in (Supabase) and environment configuration.
- Hosted drafts/My drills are user-scoped private records, not public Drill Exchange listings.
- Android runtime responsibilities remain in the companion client: https://github.com/Voycepeh/CaliVision.

See:
- `docs/supabase-setup.md`
- `docs/local-vs-hosted-persistence.md`
- `docs/hosted-drafts.md`
