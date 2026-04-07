# CaliVision Studio

CaliVision Studio is the **web-first home** for:

- **Drill Studio** authoring,
- future browser **Upload Video** workflows,
- **portable drill package** import/export/publishing,
- future **Drill Exchange** discovery, sharing, and fork/remix flows.

Library is now the default home route (`/library`), with Drill Studio (`/studio`) as the focused editing workspace.

Android/mobile runtime client (downstream consumer): <https://github.com/Voycepeh/CaliVision>.

## Product flow (current UX)

1. Start in **Library** to continue work, create/open drills, import packages, and browse Exchange listings.
2. Use **Drill Studio** for editing metadata, phases, source images, detection/refinement, and animation preview.
3. Use **Upload Video** route as the browser workflow shell for future analysis-to-draft flows.
4. Use **Drill Exchange** for discovery semantics (currently local/mock-backed).
5. Use **Package Tools** for technical import/export portability workflows.

## Terminology

- Use **Drill** in user-facing authoring/browsing flows.
- Use **Package** where portability/transport/schema compatibility matters.
- Use **Drill Exchange** for discovery/sharing direction.

## Current vs planned

### Current/near-current

- create drill content,
- edit metadata/phases,
- upload phase image,
- detect/refine pose,
- preview animation,
- export Android-compatible package.

### Planned-next

- browser Upload Video processing,
- generated draft/review output,
- hosted Exchange/auth/storage,
- richer sharing/community capabilities.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Local draft persistence (current)

Drill Studio now autosaves working drafts to browser-local IndexedDB so edits survive refresh, tab close, and reopen on the same device/browser.

- **Local draft**: durable in this browser only.
- **Export package**: portable file for import/share and Android runtime client workflows: <https://github.com/Voycepeh/CaliVision>.
- **Publish**: still local/mock for now; hosted sync/auth/storage is intentionally deferred.

If browser storage is blocked/unavailable, editing still works in-session but local durability is reduced.
