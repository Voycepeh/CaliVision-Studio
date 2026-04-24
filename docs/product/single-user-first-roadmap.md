# Single-User-First Roadmap

## Problem statement
CaliVision Studio currently spans drill authoring, analysis, exchange, and portability workflows. That breadth is useful, but the highest near-term product risk is not feature coverage; it is whether one committed user can reliably train, review, improve, and retain progress every session.

For the current MVP phase, roadmap and implementation priority should optimize the single-user training loop first, then layer broader Drill Exchange/community depth after the loop is consistently strong.

## Target user experience
A solo athlete can open Studio, select a drill quickly, run Upload Video or live analysis, understand results without decoding technical traces, improve the next attempt, and retain meaningful history over time.

The experience should feel practical for frequent daily training, not just feature-complete for demos.

## Core training loop
1. Pick drill.
2. Run live or upload.
3. Understand result clearly.
4. Improve next attempt.
5. Save useful progress.

## Sequential roadmap themes

### 1) Analysis review panel redesign
**Goal:** Make analysis output understandable in training terms by default.

- Replace cramped horizontal phase rail with a vertical review panel.
- For REP drills, present Rep 1/2/3... with start, end, duration, counted/failed status, phase sequence, and explicit failed-rep reason.
- For HOLD drills, present Hold 1/2... with start, end, duration, and target-met status.
- Keep technical traces available in expandable diagnostics, but not primary.

### 2) Session history + saved attempts
**Goal:** Make analysis cumulative so users can measure progress session-to-session.

- Auto-save attempt summaries after upload/live runs.
- Attach attempts to drill id/version.
- Track core metrics: reps counted, incomplete reps, longest hold, total duration, common failure reason, created timestamp.
- Add per-drill history with recent attempts and personal best indicators.

### 3) Fast drill access (recents/favorites/my drills/built-ins)
**Goal:** Reduce time-to-start for repeat usage.

- Promote recent drills and favorites.
- Keep “My Drills” and built-ins one-step accessible.
- Keep Drill Exchange available but reduce its prominence in the default training path.

### 4) Live coaching usability polish
**Goal:** Make live mode usable at training distance.

- Cleaner fullscreen HUD.
- Larger rep/hold state and current phase indicators.
- Less clutter, more stable overlay visibility.
- Optional audio cues where feasible.

### 5) Personal drill authoring polish
**Goal:** Improve authoring reliability for personal training outcomes.

- Reliable phase naming and ordering.
- Clear movement type selection (REP vs HOLD).
- Correct camera view handling.
- Auto benchmark/reference creation on mark ready/publish where applicable.
- Ensure previews match runtime overlay/analysis behavior.

## What we are deprioritising for now
- Drill Exchange discovery sophistication.
- Advanced moderation/admin.
- Public publishing polish.
- Multi-user collaboration.
- Social/community features.
- Large marketplace search/filter work.

## Success criteria for the single-user MVP
- A user can complete the full loop (pick → run → understand → improve → save) in one session without external guidance.
- Analysis output is readable for training decisions without opening diagnostics.
- Attempt history provides enough continuity to compare recent performance and personal bests.
- Drill selection for repeat practice is fast enough to feel routine (minimal navigation friction).
- Live HUD remains readable from practical training distance.
- Personal drill edits reliably transfer into runtime behavior.

## Proposed 5-PR implementation sequence after this docs PR
1. **PR 2:** Analysis review panel redesign.
2. **PR 3:** Session history + saved attempts.
3. **PR 4:** Fast drill access.
4. **PR 5:** Live usability polish.
5. **PR 6:** Personal drill authoring polish.

## Ecosystem boundary reminder
Studio (this repository) remains the cross-platform source of truth for drill authoring and analysis workflows.

The Android app remains an optional runtime/live-coaching specialization client: <https://github.com/Voycepeh/CaliVision>.
