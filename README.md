# CaliVision Studio

CaliVision Studio is a **web-first drill authoring workspace** with package import/export today and publish/storage groundwork for future hosted sharing.

## Current scope (PR9)

Included:
- package IO + validation foundation,
- working-copy authoring workflow with phase and pose editing,
- source-image-assisted pose detection and animation preview,
- local export/download of portable package JSON,
- publishing abstraction layer (`src/lib/publishing/*`),
- publish-ready metadata placeholders on manifest (`manifest.publishing`),
- publish readiness checks (blocking errors vs advisory warnings),
- local/mock publish flow with mock locator + recent publish list,
- explicit separation between export/download and publish simulation.

Intentionally deferred:
- auth,
- real cloud storage/registry backend,
- marketplace browsing/search,
- social/moderation features,
- live coaching/browser webcam workflows.

## Local workflow

From `/studio`:
1. Load a bundled sample package or import a local package JSON.
2. Edit drill metadata, phases, poses, and timing.
3. Export/download package JSON for portable sharing.
4. Click **Publish** to open publish prep in the right panel.
5. Run readiness checks and resolve blocking issues.
6. Publish to the local/mock provider and review the returned mock locator.

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Route map

- `/` - project entry and route index
- `/studio` - primary authoring + publish prep workspace
- `/library` - library placeholder
- `/packages` - drill file workflow placeholder
- `/marketplace` - future sharing surface placeholder

## Additional docs

- `docs/product-direction.md`
- `docs/architecture.md`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- `docs/roadmap.md`
- `docs/pr-plan.md`
