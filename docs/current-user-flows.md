# Current User Flows (PR 0 Aligned)

Date: April 23, 2026.

Android runtime counterpart (separate ownership): https://github.com/Voycepeh/CaliVision.

## Top-level flow map

1. Enter **Dashboard** (`/library`) as the default working hub.
2. Move into **Drills** (Drill Library + Drill Studio) to create/edit a draft.
3. Move into **Analysis** (`/upload`) for Upload Analysis and review metrics.
4. Use **Live & Compare** (`/live`) for live coaching capture plus benchmark-aware interpretation.
5. Return to Dashboard and iterate.

## Dashboard → Drills flow

1. Open Drill Library and inspect available drills.
2. Create a new draft or open an existing drill.
3. Route into Drill Studio for authoring updates.
4. Return to Dashboard actions: Upload Analysis, Live & Compare posture, publish/discovery steps.

## Drill Studio flow (current)

1. Edit draft metadata and authored phases.
2. Refine pose/detection and preview animation.
3. Save draft, mark ready, and publish when valid.
4. Keep diagnostics secondary/collapsible so authoring remains primary.

Maturity: **Shipped core**.

## Analysis flow (current)

1. Select drill context (or freestyle).
2. Upload local footage for browser-based processing.
3. Review replay with overlay and key metrics.
4. Inspect benchmark feedback and timeline events.
5. Export artifacts as needed.

Maturity: **Shipped core** with ongoing visual polish.

## Live & Compare posture flow (current)

1. Start from live capture/replay route (`/live`) or analysis replay outcomes.
2. Use benchmark-aware result interpretation.
3. Prioritize coaching next steps from summary/finding signals.

Maturity: **Partial** (live capture/review is shipped; richer compare UI remains deferred).

## Drill Exchange flow (current)

1. Browse public Drill Exchange listings.
2. Preview details.
3. Explicitly add to Drill Library.

Maturity: **Partial**, supporting Drills pillar but not replacing primary Dashboard/Drills/Analysis/Compare flow.

## Responsive posture

- Laptop-first composition remains primary.
- Mobile web uses responsive variants of the same product routes and terminology.
- Dense diagnostics are treated as secondary on small screens.

## Detailed implementation truth

For execution-level behavioral detail (upload cadence, lifecycle gates, local-vs-cloud semantics, benchmark assumptions), see `docs/current-behavior-implementation-truth.md`.
