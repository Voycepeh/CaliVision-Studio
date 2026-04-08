# Upload Video drill selection and analysis inspection

This flow exists to make **Upload Video** validation practical before any scoring-model rewrite.

## Drill selection flow

- Upload Video now starts with a **Select drill** control.
- Drill sources can include:
  - **seeded drills** (including simple validation drills),
  - **local drafts** saved in this browser/device,
  - **hosted drills** when signed in and hosted library is available.
- The selected drill is shown with drill type and source and is bound directly to each analysis run.

## Why the inspection view exists

Final counts alone (`reps`, `hold duration`, `events`) are not enough to debug analysis quality.
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

