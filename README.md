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
2. Use **Drill Studio** (`/studio`) to edit drill metadata, phases, source images, pose detection/refinement, and animation preview.
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

## Local draft persistence (current)

Drill Studio autosaves working drafts to browser-local IndexedDB so edits survive refresh, tab close, and reopen on the same device/browser.

- **Local draft**: durable in this browser only, appears under `Recent local drafts`.
- **Saved drill**: appears under `My drills` only after explicit Save to library/import/publish.
- **Export drill**: portable file for import/share and Android runtime client workflows: <https://github.com/Voycepeh/CaliVision>.
- **Publish**: still local/mock for now; hosted sync/auth/storage is intentionally deferred.
