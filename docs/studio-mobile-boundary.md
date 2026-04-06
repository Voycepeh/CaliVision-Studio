# Studio-Mobile Boundary

## Boundary statement

CaliVision-Studio is the **source of truth** for drill/package authoring and publishing.
Mobile apps are **runtime consumers** of Studio-authored packages.

Android repo: <https://github.com/Voycepeh/CaliVision>.

## Mermaid: boundary diagram

```mermaid
flowchart TB
    subgraph Studio[Studio Web]
      A[Drill authoring]
      B[Upload Video direction]
      C[Package validation/export/publish]
      D[Future Drill Exchange]
    end

    subgraph Mobile[Mobile runtime client]
      E[Package import]
      F[Runtime playback]
      G[Live coaching]
      H[User session consumption]
    end

    Studio -->|portable drill package| Mobile
```

## Engineering implications

- keep portable package contracts stable,
- keep schema evolution explicit/versioned,
- avoid embedding mobile runtime logic into Studio,
- ensure Studio docs reflect what is implemented vs planned,
- preserve Android compatibility whenever contracts/semantics change.
