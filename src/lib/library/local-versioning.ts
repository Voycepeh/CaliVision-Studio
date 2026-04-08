export type LocalVersionSnapshot = {
  drillId: string;
  versionNumber: number;
  status: "draft" | "ready";
  updatedAtIso: string;
};

export function reconcileLocalVersionSnapshots<T extends LocalVersionSnapshot>(versions: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const version of versions) {
    const key = `${version.drillId}:${version.versionNumber}:${version.status}`;
    const existing = deduped.get(key);
    if (!existing || new Date(version.updatedAtIso).getTime() > new Date(existing.updatedAtIso).getTime()) {
      deduped.set(key, version);
    }
  }

  return Array.from(deduped.values());
}
