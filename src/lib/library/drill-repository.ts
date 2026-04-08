import { ensureVersioningMetadata, getPrimarySamplePackage } from "@/lib/package";
import { loadDraft, loadDraftList, saveDraft, type LocalDraftRecord, type LocalDraftSummary } from "@/lib/persistence/local-draft-store";
import { loadLocalRegistryEntries, upsertRegistryEntryFromPackage, type PackageRegistryEntry } from "@/lib/registry";
import type { DrillPackage } from "@/lib/schema/contracts";

export type DrillVersionStatus = "draft" | "ready";

export type DrillVersionSnapshot = {
  versionId: string;
  drillId: string;
  versionNumber: number;
  status: DrillVersionStatus;
  isPublished: boolean;
  createdAtIso: string;
  updatedAtIso: string;
  title: string;
  packageJson: DrillPackage;
  source: "draft" | "library";
  sourceId: string;
};

export type DrillLibraryItem = {
  drillId: string;
  title: string;
  activeVersionId: string;
  latestDraftVersionId: string | null;
  activeVersion: DrillVersionSnapshot;
  updatedAtIso: string;
};

function parseVersionNumber(pkg: DrillPackage): number {
  const revision = pkg.manifest.versioning?.revision;
  if (typeof revision === "number" && Number.isFinite(revision) && revision > 0) return Math.floor(revision);
  const parsed = Number.parseInt(pkg.manifest.packageVersion.split(".").at(-1) ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function toDraftVersion(summary: LocalDraftSummary, record: LocalDraftRecord): DrillVersionSnapshot {
  const pkg = ensureVersioningMetadata(record.packageJson);
  return {
    versionId: summary.draftId,
    drillId: summary.packageId,
    versionNumber: parseVersionNumber(pkg),
    status: "draft",
    isPublished: false,
    createdAtIso: summary.createdAtIso,
    updatedAtIso: summary.updatedAtIso,
    title: summary.title,
    packageJson: pkg,
    source: "draft",
    sourceId: summary.draftId
  };
}

function toReadyVersion(entry: PackageRegistryEntry): DrillVersionSnapshot {
  const pkg = ensureVersioningMetadata(entry.details.packageJson);
  return {
    versionId: entry.entryId,
    drillId: entry.summary.packageId,
    versionNumber: parseVersionNumber(pkg),
    status: "ready",
    isPublished: entry.summary.publishStatus === "published",
    createdAtIso: pkg.manifest.createdAtIso,
    updatedAtIso: entry.summary.updatedAtIso,
    title: entry.summary.title,
    packageJson: pkg,
    source: "library",
    sourceId: entry.entryId
  };
}

export async function listVersionsForDrill(drillId: string): Promise<DrillVersionSnapshot[]> {
  const [drafts, entries] = await Promise.all([loadDraftList(), Promise.resolve(loadLocalRegistryEntries())]);
  const draftVersions = await Promise.all(
    drafts
      .filter((draft) => draft.packageId === drillId)
      .map(async (draft) => {
        const loaded = await loadDraft(draft.draftId);
        return loaded ? toDraftVersion(draft, loaded.record) : null;
      })
  );
  const readyVersions = entries.filter((entry) => entry.summary.packageId === drillId).map(toReadyVersion);
  return [...readyVersions, ...draftVersions.filter((v): v is DrillVersionSnapshot => Boolean(v))].sort(
    (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime()
  );
}

export async function listDrillsWithActiveVersion(): Promise<DrillLibraryItem[]> {
  const entries = loadLocalRegistryEntries();
  const drafts = await loadDraftList();
  const drillIds = new Set<string>([...entries.map((entry) => entry.summary.packageId), ...drafts.map((draft) => draft.packageId)]);

  const drills = await Promise.all(
    Array.from(drillIds).map(async (drillId) => {
      const versions = await listVersionsForDrill(drillId);
      if (!versions.length) return null;
      const readyVersions = versions.filter((version) => version.status === "ready");
      const draftVersions = versions.filter((version) => version.status === "draft");
      const activeVersion = readyVersions[0] ?? draftVersions[0];
      if (!activeVersion) return null;
      return {
        drillId,
        title: activeVersion.title,
        activeVersionId: activeVersion.versionId,
        latestDraftVersionId: draftVersions[0]?.versionId ?? null,
        activeVersion,
        updatedAtIso: activeVersion.updatedAtIso
      } satisfies DrillLibraryItem;
    })
  );

  return drills
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

export async function createDrill(): Promise<{ drillId: string; draftVersionId: string }> {
  const now = new Date().toISOString();
  const draftId = `draft-${Date.now()}`;
  const drillId = `drill-${Date.now()}`;
  const pkg = ensureVersioningMetadata(structuredClone(getPrimarySamplePackage()));
  pkg.manifest.packageId = drillId;
  pkg.manifest.packageVersion = "0.1.0";
  pkg.manifest.createdAtIso = now;
  pkg.manifest.updatedAtIso = now;
  pkg.manifest.versioning = {
    ...(pkg.manifest.versioning ?? {}),
    packageSlug: pkg.manifest.versioning?.packageSlug ?? drillId,
    lineageId: drillId,
    versionId: draftId,
    revision: 1,
    draftStatus: "draft"
  };
  if (pkg.drills[0]) {
    pkg.drills[0].drillId = drillId;
    pkg.drills[0].title = "New drill";
  }
  await saveDraft({ draftId, sourceLabel: "authored-local", packageJson: pkg, assetsById: {} });
  return { drillId, draftVersionId: draftId };
}

export async function createDraftVersion(drillId: string): Promise<{ draftVersionId: string; resumed: boolean }> {
  const versions = await listVersionsForDrill(drillId);
  const existingDraft = versions.find((version) => version.status === "draft");
  if (existingDraft) return { draftVersionId: existingDraft.versionId, resumed: true };
  const activeReady = versions.find((version) => version.status === "ready");
  if (!activeReady) throw new Error("No base version exists for this drill yet.");

  const nextDraftId = `draft-${Date.now()}`;
  const next = ensureVersioningMetadata(structuredClone(activeReady.packageJson));
  next.manifest.updatedAtIso = new Date().toISOString();
  next.manifest.versioning = {
    ...(next.manifest.versioning ?? {}),
    packageSlug: next.manifest.versioning?.packageSlug ?? next.manifest.packageId,
    versionId: nextDraftId,
    revision: next.manifest.versioning?.revision ?? parseVersionNumber(next),
    lineageId: next.manifest.versioning?.lineageId ?? next.manifest.packageId,
    draftStatus: "draft",
    derivedFrom: {
      relation: "new-version",
      parentPackageId: activeReady.packageJson.manifest.packageId,
      parentVersionId: activeReady.packageJson.manifest.versioning?.versionId ?? activeReady.packageJson.manifest.packageVersion,
      note: activeReady.isPublished ? "Derived from published ready version." : "Derived from ready version."
    }
  };
  await saveDraft({ draftId: nextDraftId, sourceLabel: `new-version:${activeReady.versionId}`, packageJson: next, assetsById: {} });
  return { draftVersionId: nextDraftId, resumed: false };
}

export async function markVersionReady(draftVersionId: string): Promise<void> {
  const loaded = await loadDraft(draftVersionId);
  if (!loaded) throw new Error("Draft version could not be loaded.");
  const pkg = ensureVersioningMetadata(structuredClone(loaded.record.packageJson));
  pkg.manifest.versioning = {
    ...(pkg.manifest.versioning ?? {}),
    packageSlug: pkg.manifest.versioning?.packageSlug ?? pkg.manifest.packageId,
    versionId: pkg.manifest.versioning?.versionId ?? draftVersionId,
    revision: pkg.manifest.versioning?.revision ?? parseVersionNumber(pkg),
    lineageId: pkg.manifest.versioning?.lineageId ?? pkg.manifest.packageId,
    draftStatus: "publish-ready"
  };
  pkg.manifest.updatedAtIso = new Date().toISOString();
  upsertRegistryEntryFromPackage({ packageJson: pkg, sourceType: "authored-local", sourceLabel: `ready-from:${draftVersionId}` });
}

export function publishVersion(version: DrillVersionSnapshot): void {
  if (version.status !== "ready") throw new Error("Only Ready versions can be published.");
  const pkg = ensureVersioningMetadata(structuredClone(version.packageJson));
  pkg.manifest.publishing = { ...(pkg.manifest.publishing ?? {}), publishStatus: "published" };
  upsertRegistryEntryFromPackage({
    packageJson: pkg,
    sourceType: "mock-published",
    sourceLabel: `published-from:${version.versionId}`,
    publishedAtIso: new Date().toISOString()
  });
}

export async function listReadyDrillsForUpload(): Promise<Array<{ drillId: string; title: string; versionId: string; packageJson: DrillPackage; isPublished: boolean }>> {
  const drills = await listDrillsWithActiveVersion();
  return drills
    .filter((drill) => drill.activeVersion.status === "ready")
    .map((drill) => ({
      drillId: drill.drillId,
      title: drill.title,
      versionId: drill.activeVersion.versionId,
      packageJson: drill.activeVersion.packageJson,
      isPublished: drill.activeVersion.isPublished
    }));
}
