# Upload Video drill selection and analysis inspection

This flow exists to make **Upload Video** validation practical before any scoring-model rewrite.

## Mode and drill selection flow

- Upload Video now defaults to **No drill · Freestyle overlay**.
- Drill-specific analysis is optional and secondary.
- Optional drill sources include:
  - **local drafts** saved in this browser/device,
  - **hosted drills** when signed in and hosted library is available.
- Upload jobs snapshot the selected mode/drill binding at queue time, so later picker changes do not retarget already queued videos.
- Freestyle mode keeps the workflow honest: overlay-first processing and export, without implying active rep/hold/phase scoring.

## Why the inspection view exists

Final totals alone (`reps`, `hold duration`, `events`) are not enough to debug analysis quality.
The main replay cards now show **playhead-relative state** (completed reps so far, current hold, current phase/current rep), while full-session totals remain available in summary/download artifacts.
The inspection panel exposes intermediate pipeline state so manual testers can answer:

- Which phase the classifier chose per sample.
- Whether smoothing accepted/rejected candidate phases.
- Which transitions were rejected and why.
- Why no rep/hold events were produced.

## Debugging with the inspection panel

For a saved session, use:

- **Analysis inspection** table for per-sample phase, score, alternates, and smoother output.
- **Temporal trace** list for accepted/rejected transitions with reasons.
- **Replay seek links** from sample rows and transition rows to inspect exact timestamps.
- **Phase timeline segments** that represent detected analyzed phase progression over replay time, with a visible playhead indicator.

## Diagnosable failure classes

The current view can now surface known causes such as:

- no confirmed phase transitions,
- low-confidence frames,
- no valid smoothed phases,
- ordered sequence/hold qualification not satisfied.

## Out of scope for this PR

- scoring-model improvements,
- major Upload Video UI redesign,
- hosted analytics dashboard,
- ML classifier changes.

Studio remains the web-first authoring/analysis source of truth, while runtime/live coaching remains in the Android client: <https://github.com/Voycepeh/CaliVision>.


## Derived runtime loop and numbered phase labels

Upload Video, live overlay, temporal trace, event logs, and diagnostics now use one canonical runtime model derived from Drill Studio authored phase order.

- Phase order is authored as an ordered list in Drill Studio.
- Runtime always auto-closes the loop from last phase back to phase 1.
- Numbered phase labels are used consistently (for example `1. Start`, `2. Flap`, `Phase 2/3 · Flap`).
- Rep drills require at least two phases and count only when the full loop returns to phase 1.
- Hold drills accumulate time only while the selected hold phase is confidently active.
- Similarity warnings in Drill Studio help flag phases that may be hard to distinguish at runtime.
