# PR1 Plan - Studio Foundation

## Scope

- Web app bootstrap (Next.js + TS + App Router)
- Dark 3-panel Studio shell
- Placeholder routes for upcoming workflows
- Portable contract groundwork + docs + sample package

## Explicit non-goals

- Full pose detection
- Marketplace implementation
- Auth, backend, or cloud persistence

## Risks and mitigations

- Risk: Contract drift between web and Android
  - Mitigation: Keep schema docs, TS contracts, and sample payload in lockstep.
- Risk: UI shell rework in later PRs
  - Mitigation: Isolate layout primitives from panel content.

## Follow-up PR candidates

1. JSON schema files + runtime validation.
2. Package import/export from Studio UI.
3. Pose canvas and timeline edit interactions.
4. MediaPipe-assisted drafting and review loops.
