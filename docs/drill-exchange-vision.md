# Drill Exchange Vision

Drill Exchange is the discovery/sharing surface for reusable drills.

## Current state

- user-facing Exchange UX exists with hosted publish/browse/detail/fork flows,
- publish creates a snapshot tied to a specific Ready release version,
- fork/remix creates a user-owned editable draft in normal Library/Studio workflow with stored fork lineage,
- Upload Video local analysis remains device-local and separate from hosted exchange,
- Home + Library positioning keeps Exchange discoverable but secondary to drill creation/editing.

## Future direction

- broaden hosted ownership/identity beyond MVP metadata,
- graph/network discovery exploration,
- AI retrieval/chat experiences over Exchange metadata and drill knowledge,
- Studio/mobile ecosystem continuity.

## Drill Knowledge Graph foundation (deterministic scaffolding)

- Executable drill packages remain the runtime source of truth for scoring/coaching behavior.
- Studio now includes a derived **Drill Knowledge Document** layer for Exchange discovery/explanation surfaces.
- This knowledge layer is deterministic (rule-based generation from drill/package fields), read-only, and does not mutate executable drill rules.
- Current persistence posture: knowledge documents are derived on the client and cached locally in browser storage (including hosted-draft mode); no dedicated hosted knowledge persistence is introduced yet.
- The current implementation is scaffolding for future enrichment while preserving local-first and hosted-draft compatibility boundaries.

Android runtime relationship: exported/published packages remain consumable by <https://github.com/Voycepeh/CaliVision>.

> Note (April 2026): Studio now has initial Supabase hosted-draft/auth groundwork; public Exchange/publishing and mobile runtime remain separate concerns (mobile runtime: https://github.com/Voycepeh/CaliVision).
