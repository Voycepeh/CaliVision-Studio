"use client";

import { useEffect, useState } from "react";
import { loadLocalRegistryEntries, type PackageRegistryEntry } from "@/lib/registry";

export function PackageOverview() {
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);

  useEffect(() => {
    setEntries(loadLocalRegistryEntries());
  }, []);

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
      <h2 style={{ margin: 0 }}>Package Artifacts & Transport</h2>
      <p className="muted" style={{ margin: 0 }}>
        Packages focuses on import/export portability, schema compatibility, and artifact lifecycle. Use Library to browse
        installed/available entries and Marketplace for discovery semantics.
      </p>

      <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
        <li>Import package files into local Library via Studio top bar import.</li>
        <li>Export current working package from Studio as portable JSON artifact.</li>
        <li>Mock publish writes listing metadata into local registry state only.</li>
      </ul>

      <div className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Recent local package artifacts</h3>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {entries.slice(0, 6).map((entry) => (
            <div key={entry.entryId} style={{ border: "1px solid var(--border)", borderRadius: "0.55rem", padding: "0.45rem" }}>
              <strong>{entry.summary.packageId}</strong>
              <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                v{entry.summary.packageVersion} • {entry.summary.sourceType} • {entry.summary.provenanceSummary} • schema {entry.summary.schemaVersion}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
