# Agent Guidance for CaliVision Studio

## Repository purpose

CaliVision Studio is the **web-first home** for:

- Drill Studio authoring,
- browser Upload Video analysis direction,
- portable drill package creation and publishing,
- future Drill Exchange/community workflows.

Studio is the long-term **source of truth** for drill definitions and package publishing.

The Android app is a downstream runtime/live-coaching client: <https://github.com/Voycepeh/CaliVision>.

## Product UX direction (current)

- `/library` is the default home/landing route and should feel like the user’s primary workspace start.
- `/studio` is the focused editing workspace.
- `/upload` is the first-class Upload Video route shell.
- `/marketplace` is user-facing **Drill Exchange** discovery language.
- `/packages` is technical portability tooling and should be de-emphasized in primary product messaging.

Prefer user-facing wording:
- **Drill** for most UI language,
- **Package** for import/export/portability contexts,
- **Drill Exchange** for discovery/sharing semantics.

## Ecosystem boundary

- **Studio (this repo):** author drills, edit phases, detect/refine pose, preview animation, package export/publish, exchange workflows.
- **Android/mobile runtime client:** import packages, run drill playback/live coaching, consume Studio-authored content.

Do not move runtime/live coaching concerns into Studio unless explicitly requested.

## Core engineering principles

1. Preserve portable package contract stability.
2. Maintain Android/mobile compatibility when contracts or semantics change.
3. Keep PRs incremental, architecture-aware, and backward-compatible when possible.
4. Prefer additive schema evolution and explicit manifest/versioning notes.
5. Keep docs and user workflows clear and synchronized with implementation.

## Repo structure responsibility map

- `src/lib/schema/contracts.ts`: canonical portable package contract definitions.
- `src/lib/package/*`: package validation/import/export/versioning/sample fixtures.
- `src/lib/editor/*`: Studio working-copy mutation helpers.
- `src/lib/detection/*` + `src/lib/pose/*` + `src/lib/canvas/*`: detection integration and canonical pose/canvas mapping.
- `src/lib/publishing/*` + `src/lib/registry/*`: publish and local catalog abstractions around package artifacts.
- `src/components/*`: UI components only.
- `src/app/*`: route entrypoints/layout composition.

Prefer keeping business logic out of components when it can live in `src/lib/*` seams.

## Contract and documentation synchronization (mandatory)

If you modify drill/package contracts, semantics, or payload examples, update all relevant files in the same PR:

- `src/lib/schema/contracts.ts`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- impacted payloads in `samples/`
- any impacted workflow docs in `docs/` (for example, current/future flows, lifecycle, boundary)

## Documentation discipline (mandatory)

Update documentation whenever workflows, architecture boundaries, or roadmap assumptions change.

At minimum, validate and adjust as needed:

- `README.md`
- `docs/product-overview.md`
- `docs/current-user-flows.md`
- `docs/future-user-flows.md`
- `docs/system-overview.md`
- `docs/studio-mobile-boundary.md`
- `docs/package-lifecycle.md`
- `docs/drill-exchange-vision.md`
- `docs/roadmap.md`
- `docs/pr-plan.md`

Document assumptions/non-goals explicitly in `docs/pr-plan.md`.

## Cross-repo linking requirement

Wherever Android/mobile runtime responsibilities are documented, include a direct link to:

- <https://github.com/Voycepeh/CaliVision>

Wherever Studio is discussed as ecosystem counterpart, keep that boundary explicit and consistent.

## Data/backend posture

Use static/mock/local-first data unless a PR explicitly introduces backend integration.
Do not overclaim hosted auth/storage/exchange features before implementation exists.

## Workflow clarity expectations

- Use consistent terminology: **Drill Studio**, **Upload Video**, **portable drill package**, **Drill Exchange**, **mobile runtime client**, **source of truth**.
- Keep current capabilities clearly separated from planned/future features.
- Call out limitations honestly (for example local-first persistence vs hosted services).
