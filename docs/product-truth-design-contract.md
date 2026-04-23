# Product Truth + Design Contract (PR 0 Alignment)

Date: April 23, 2026.

## Purpose

This document establishes the canonical product truth for CaliVision Studio before deeper implementation PRs. It aligns wording, information architecture, and visual direction to a premium web coaching product while staying honest about feature maturity.

Android runtime counterpart (separate scope): https://github.com/Voycepeh/CaliVision.

## Canonical product pillars

1. **Dashboard** — default workspace entry, centered on Drill Library and recent work.
2. **Drills** — Drill Studio authoring + Drill Library selection and management.
3. **Analysis** — Upload Analysis workflow and review metrics.
4. **Compare** — benchmark/reference comparison posture from replay and session review.

Supporting pillar:
- **Drill Exchange** — discovery/import into Drill Library, not the primary top-level workflow.

## Canonical user workflow

1. Open **Dashboard** (`/library`) and choose a drill context.
2. Enter **Drills** (`/studio` and library actions) to create/edit a draft.
3. Use **Analysis** (`/upload`) to process footage and review key metrics.
4. Use **Compare** posture (`/live` today, richer comparison surfaces planned) for benchmark-aware coaching interpretation.
5. Return to Dashboard for iteration and next session setup.

## Golden screens (target)

### 1) Homepage / Landing
- **Role:** communicate premium product story and web workflow.
- **Primary content:** clear “create → analyze → review/compare” flow.
- **Secondary content:** Drill Exchange and ecosystem boundary references.
- **Maturity:** **Partial** (directional copy + structure in place).

### 2) Drill Studio
- **Role:** focused draft authoring.
- **Primary content:** metadata, phases, pose/detection, version actions.
- **Secondary content:** diagnostics and advanced compatibility details.
- **Maturity:** **Shipped core**.

### 3) Drill Library
- **Role:** operational drill hub.
- **Primary content:** create/open/edit/analyze/live actions.
- **Secondary content:** import/export, Exchange add/remove status.
- **Maturity:** **Shipped core**.

### 4) Upload Analysis
- **Role:** ingestion + processing + replay shell.
- **Primary content:** upload setup, video/overlay replay, key metrics.
- **Secondary content:** advanced diagnostics and artifact downloads.
- **Maturity:** **Shipped core**.

### 5) Review / key metrics
- **Role:** fast coaching readout from a completed analysis.
- **Primary content:** reps/holds/phase/benchmark summary cards.
- **Secondary content:** timeline diagnostics and detailed events.
- **Maturity:** **Partial-to-shipped** (foundational shell shipped, polish planned).

### 6) Compare
- **Role:** benchmark-aware interpretation surface.
- **Primary content:** benchmark status and coaching deltas.
- **Secondary content:** deeper sequence/timing compare visualization.
- **Maturity:** **Partial** (foundational posture and labels, deeper UI planned).

### 7) Responsive mobile web posture
- **Role:** same product, responsive layout.
- **Primary content:** capture/analysis/review with touch-safe controls.
- **Secondary content:** dense diagnostics collapsed by default.
- **Maturity:** **Shipped baseline** with iterative polish needed.

## Visual design contract

Adopted direction:
- dark premium UI (near-black + navy surfaces),
- bright cyan accent,
- strong typographic hierarchy,
- rounded polished card shells,
- reusable page header + status chip pattern,
- laptop-first composition responsive to mobile.

Avoided direction:
- generic admin-dashboard density,
- debug-first unlabeled panels,
- conflicting naming at top-level navigation,
- implying unfinished flows are complete.

## Maturity truth table

| Product area | Current truth |
|---|---|
| Dashboard / Drill Library | **Shipped** core workflow |
| Drill Studio | **Shipped** authoring core |
| Upload Analysis | **Shipped** review core |
| Review metrics shell | **Shipped foundation / Partial polish** |
| Compare | **Partial** posture + benchmark language |
| Drill Exchange | **Partial** discovery/import maturity |
| Mobile web responsiveness | **Shipped baseline / Partial polish** |

## PR sequence after this alignment

- **PR 1 (next):** analysis review redesign aligned to this contract (metrics hierarchy, compare framing, benchmark narrative consistency, mobile polish).
- **PR 2:** Drill Library + Drill Studio visual continuity pass (selected drill cards, action bars, compact insight panels).
- **PR 3:** Compare-focused surfaces (deeper benchmark deltas, timeline compare affordances).
