# Product Overview

## Mission

CaliVision Studio is the web-first source of truth for drill authoring and drill-first workflows.

Android runtime/live coaching client (downstream): <https://github.com/Voycepeh/CaliVision>.

## Product pillars (PR 0 alignment)

1. **Dashboard:** default web workspace entry at `/library`.
2. **Drills:** Drill Library + Drill Studio authoring lifecycle.
3. **Analysis:** Upload Analysis + review metrics workflow.
4. **Compare:** benchmark/reference interpretation posture.
5. **Drill Exchange (supporting):** discovery/import workflow supporting Drills, not replacing the primary pillar flow.

## Language model

- user-facing: **drill**
- technical portability: **package**
- discovery/share: **Drill Exchange**

> Note (April 2026): Studio now has initial Supabase hosted-draft/auth groundwork; public Exchange/publishing and mobile runtime remain separate concerns (mobile runtime: https://github.com/Voycepeh/CaliVision).

## Persistence UX direction (April 2026)

- User-facing storage concepts stay simple: **Drafts** and **My drills**.
- Signed out experience is browser/device local with explicit local-storage messaging.
- Signed in experience is account-hosted first; local browser persistence is resilience/fallback, not primary navigation.
