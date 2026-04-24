# PR Plan — PR 0 Product Truth + IA Alignment

Date: April 23, 2026.

## Goal

Establish a coherent product truth, visual direction, and information architecture for CaliVision Studio before deeper feature delivery.

Android runtime/live coaching counterpart remains separate: https://github.com/Voycepeh/CaliVision.

## Branch posture

This branch is treated as a **target-state alignment branch** and should explicitly separate:

- **current shipped truth,**
- **near-term target execution,**
- **later vision.**

Do not blur those states in page labels or maturity claims.

## Canonical IA for this phase

- **Dashboard**
- **Drills**
- **Analysis**
- **Live & Compare**

With product sub-areas:
- **Drills:** Drill Studio + Drill Library
- **Analysis:** Upload Analysis + review metrics
- **Live & Compare:** live capture/review posture with benchmark/reference comparison layering

## Scope in PR 0

1. Document the product truth and visual contract.
2. Refresh workflow/roadmap docs around canonical IA and golden screens.
3. Normalize app naming and top-level labels toward Dashboard/Drills/Analysis/Live & Compare.
4. Introduce lightweight reusable visual primitives (page header/status chip, dark card polish, spacing consistency).
5. Align homepage copy to the target workflow while keeping maturity claims honest.
6. Add screen-level maturity notes (shipped/partial/planned).
7. Preserve operational implementation truth in a dedicated companion doc.

## Non-goals

- Full compare engine UI redesign.
- Full session history productization.
- Full Drill Exchange maturity buildout.
- Replacing real app surfaces with static fake mockups.

## Assumptions

- Studio remains the web-first source of truth for drill authoring and publishing.
- Mobile web posture is part of the same product, not a separate product line.
- Android remains optional runtime specialization: https://github.com/Voycepeh/CaliVision.

## PR 1 recommendation

**PR 1 = analysis review redesign** aligned to this contract:
- stronger key-metrics hierarchy,
- compare-focused benchmark storytelling,
- shared visual primitives applied to analysis/review shells,
- responsive mobile review polish.

This PR 1 work is the first required proof that this branch delivers real user-facing review improvements, not only doc/naming alignment.
