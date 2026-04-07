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
      <h2 style={{ margin: 0 }}>Import / export package workflows</h2>
      <p className="muted" style={{ margin: 0 }}>
        Use this surface when you need technical portability: moving drill packages between Studio and downstream runtime
        clients while preserving schema compatibility.
      </p>

      <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
        <li>Import package files via the top bar to add drills into your local Studio library.</li>
        <li>Export the selected drill from Studio as a portable package JSON artifact.</li>
        <li>Mock publish updates local Exchange listings only (no hosted backend yet).</li>
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
