# CaliVision Studio

CaliVision Studio is the **web-first home** for:

- **Drill Studio** authoring,
- browser **Upload Video** local analysis,
- portable **drill file** import/export portability,
- future **Drill Exchange** discovery, sharing, and fork/remix flows.

Library is the default home route (`/library`), with Drill Studio (`/studio`) as the focused editing workspace.

Android/mobile runtime client (downstream consumer): <https://github.com/Voycepeh/CaliVision>.

## Product flow (current UX)

1. Start in **Library** to create a new drill, continue drafts, import drill files, open existing drills, and browse shared drills.
2. Use **Drill Studio** to edit drill metadata, phases, source images, pose detection/refinement, and animation preview.
3. Use **Upload Video** to process one or more local videos in-browser with MediaPipe Pose Landmarker, preview overlays, and download local artifacts.
4. Use **Drill Exchange** (`/marketplace`) for discovery, sharing direction, and fork/remix workflows (currently local/mock-backed).

Engineering note: the portable package schema still exists behind drill file import/export for cross-client transport and Android compatibility, but it is not a primary user-facing object in Studio UX.

## Current capabilities

- create drill content,
- edit metadata/phases,
- upload phase image,
- detect/refine pose,
- preview animation,
- export Android-compatible drill file,
- process local upload videos in-browser and download:
  - pose timeline JSON,
  - analysis JSON,
  - annotated WebM video export.

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
- **Export drill**: creates a portable drill file for import/share and Android runtime client workflows: <https://github.com/Voycepeh/CaliVision>.
- **Publish**: still local/mock for now; hosted sync/auth/storage is intentionally deferred.
