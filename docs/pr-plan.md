# PR Plan — Architecture and Cleanup Stabilization Pass

## Summary

This PR performs a focused cleanup pass to reduce structural ambiguity before feature expansion.

Primary goals:
- simplify architecture/navigation,
- reduce duplicate or dead placeholder pathways,
- strengthen package-first boundaries,
- make Studio easier for a solo developer and AI agents to extend.

## Assumptions

- Studio remains the web-first home for Drill Studio, Upload Video direction, and future Drill Exchange workflows.
- Portable drill package compatibility remains mandatory.
- Android/mobile runtime client remains downstream: <https://github.com/Voycepeh/CaliVision>.
- Data posture stays local-first/mock unless explicitly changed by a later backend-focused PR.

## Non-goals

- no major new end-user feature buildout,
- no backend/auth/cloud integration rollout,
- no UI redesign,
- no contract-breaking package changes.

## Cleanup scope in this PR

- consolidate shared route intro shell for non-Studio routes,
- remove duplicate sample data pathways in favor of `src/lib/package/samples/*`,
- decouple detector mapping from editor service helpers via pose-domain utility,
- remove unused legacy contract/validation barrel paths that blurred canonical boundaries,
- add lightweight tests for phase-selection fallback behavior in the Studio workspace,
- refresh architecture/repo-structure docs to reflect current boundaries.

## Validation criteria

- package import/export and bundle ingestion paths remain functional,
- pose detection mapping still writes canonical pose data,
- Studio route semantics stay intact with `/studio` as the primary workspace,
- docs clearly distinguish foundational layers vs local-first placeholders.
