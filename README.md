# CaliVision Studio

CaliVision Studio is the **web-first home** for:

- **Drill Studio** authoring,
- browser **Upload Video** local analysis,
- **portable drill package** import/export/publishing,
- future **Drill Exchange** discovery, sharing, and fork/remix flows.

Library is the default home route (`/library`), with Drill Studio (`/studio`) as the focused editing workspace.

Android/mobile runtime client (downstream consumer): <https://github.com/Voycepeh/CaliVision>.

## Product flow (current UX)

1. Start in **Library** to continue local draft work, create a new drill draft, import drills, and manage saved drills.
2. Use **Drill Studio** for editing metadata, phases, source images, detection/refinement, and animation preview.
3. Use **Upload Video** to process one or more local videos in-browser with MediaPipe Pose Landmarker, preview overlays, and download local artifacts.
4. Use **Drill Exchange** for discovery semantics (currently local/mock-backed).
5. Use **Package Tools** for technical import/export portability workflows.

## Current capabilities

- create drill content,
- edit metadata/phases,
- upload phase image,
- detect/refine pose,
- preview animation,
- export Android-compatible package,
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
- **Export package**: portable file for import/share and Android runtime client workflows: <https://github.com/Voycepeh/CaliVision>.
- **Publish**: still local/mock for now; hosted sync/auth/storage is intentionally deferred.
