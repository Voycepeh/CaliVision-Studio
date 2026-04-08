export type LocalVersionSnapshot = {
  drillId: string;
  versionNumber: number;
  status: "draft" | "ready";
  updatedAtIso: string;
};

export function reconcileLocalVersionSnapshots<T extends LocalVersionSnapshot>(versions: T[]): T[] {
  const byDrill = new Map<string, T[]>();
  for (const version of versions) {
    const current = byDrill.get(version.drillId) ?? [];
    current.push(version);
    byDrill.set(version.drillId, current);
  }

  const reconciled: T[] = [];

  for (const drillVersions of byDrill.values()) {
    const releasedByNumber = new Map<number, T>();
    for (const version of drillVersions.filter((item) => item.status === "ready")) {
      const existing = releasedByNumber.get(version.versionNumber);
      if (!existing || new Date(version.updatedAtIso).getTime() > new Date(existing.updatedAtIso).getTime()) {
        releasedByNumber.set(version.versionNumber, version);
      }
    }

    const released = Array.from(releasedByNumber.values()).sort((a, b) => b.versionNumber - a.versionNumber);
    const maxReleasedVersion = released[0]?.versionNumber ?? 0;
    const openDraft = drillVersions
      .filter((item) => item.status === "draft")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime())[0];

    reconciled.push(...released);
    if (openDraft) {
      const nextVersion = maxReleasedVersion + 1;
      reconciled.push(openDraft.versionNumber > maxReleasedVersion ? openDraft : ({ ...openDraft, versionNumber: nextVersion } as T));
    }
  }

  return reconciled;
}
