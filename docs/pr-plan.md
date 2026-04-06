# PR Plan — Documentation Rewrite for Product Story Alignment

## Summary

This PR rewrites repository documentation so CaliVision-Studio is presented as:

- the web-first home for Drill Studio,
- the future browser Upload Video surface,
- the long-term source of truth for drill/package publishing,
- the future Drill Exchange platform for shared/versioned package workflows.

## Assumptions

- current implementation remains local-first for many persistence/sharing concerns,
- hosted auth/storage/exchange are planned, not fully shipped,
- Android/mobile runtime client remains a downstream consumer,
- portable drill package compatibility is mandatory.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Non-goals

- no core product feature rewrites,
- no contract or runtime semantic changes,
- no backend/auth implementation claims beyond planned direction.

## Documentation architecture changes

- rewritten root `README.md` with current-vs-planned split,
- strengthened `AGENTS.md` engineering and documentation guardrails,
- added/rewritten product/system/flow/lifecycle/boundary docs,
- added Mermaid diagrams for ecosystem, current flow, future flow, boundary, and lifecycle.

## Validation criteria

- docs consistently use core terminology,
- docs link Android repo when mobile runtime is discussed,
- docs clearly separate available-now behavior vs planned features,
- docs align with source-of-truth boundary (web authoring vs mobile runtime).
