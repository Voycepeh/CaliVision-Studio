import { ensureVersioningMetadata, getPrimarySamplePackage } from "@/lib/package";
import { deleteHostedLibraryItem, listHostedLibrary, upsertHostedLibraryItem } from "@/lib/hosted/library-repository";
import type { AuthSession } from "@/lib/auth/supabase-auth";
import { deleteDraft, loadDraft, loadDraftList, saveDraft, type LocalDraftRecord, type LocalDraftSummary } from "@/lib/persistence/local-draft-store";
import { deleteRegistryEntriesByPackageId, loadLocalRegistryEntries, upsertRegistryEntryFromPackage, type PackageRegistryEntry } from "@/lib/registry";
import type { DrillPackage } from "@/lib/schema/contracts";
import { reconcileLocalVersionSnapshots } from "./local-versioning";

export type DrillVersionStatus = "draft" | "ready";

export type DrillRepositoryContext = {
  mode: "local" | "cloud";
  session?: AuthSession | null;
};

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
  currentVersionId: string;
  activeReadyVersionId: string | null;
  latestDraftVersionId: string | null;
  currentVersion: DrillVersionSnapshot;
  activeReadyVersion: DrillVersionSnapshot | null;
  updatedAtIso: string;
};

const LOCAL_CONTEXT: DrillRepositoryContext = { mode: "local" };

function asContext(context?: DrillRepositoryContext): DrillRepositoryContext {
  return context ?? LOCAL_CONTEXT;
}

function isCloudContext(context: DrillRepositoryContext): context is DrillRepositoryContext & { mode: "cloud"; session: AuthSession } {
  return context.mode === "cloud" && Boolean(context.session);
}

function parseVersionNumber(pkg: DrillPackage): number {
  const revision = pkg.manifest.versioning?.revision;
  if (typeof revision === "number" && Number.isFinite(revision) && revision > 0) return Math.floor(revision);
  const parsed = Number.parseInt(pkg.manifest.packageVersion.split(".").at(-1) ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function bumpPatchVersion(version: string): string {
  const [majorRaw, minorRaw, patchRaw] = version.split(".");
  const major = Number.parseInt(majorRaw ?? "0", 10);
  const minor = Number.parseInt(minorRaw ?? "1", 10);
  const patch = Number.parseInt(patchRaw ?? "0", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return "0.1.0";
  }
  return `${major}.${minor}.${patch + 1}`;
}

function createUniqueId(prefix: "draft" | "drill"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapLocalPersistenceError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("requested version") && message.includes("existing version")) {
    return new Error("Local browser storage was upgraded by another Studio module. Reload once to refresh local workspace data.");
  }
  return error instanceof Error ? error : new Error("Local browser save failed.");
}

function statusFromPackage(pkg: DrillPackage): DrillVersionStatus {
  return pkg.manifest.versioning?.draftStatus === "draft" ? "draft" : "ready";
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
    versionId: entry.summary.versionId ?? entry.entryId,
    drillId: entry.summary.packageId,
    versionNumber: parseVersionNumber(pkg),
    status: statusFromPackage(pkg),
    isPublished: entry.summary.publishStatus === "published",
    createdAtIso: pkg.manifest.createdAtIso,
    updatedAtIso: entry.summary.updatedAtIso,
    title: entry.summary.title,
    packageJson: pkg,
    source: entry.summary.publishStatus === "draft" ? "draft" : "library",
    sourceId: entry.entryId
  };
}

async function listLocalVersions(): Promise<DrillVersionSnapshot[]> {
  const entries = loadLocalRegistryEntries();
  const drafts = await loadDraftList().catch(() => [] as LocalDraftSummary[]);
  const draftVersions = await Promise.all(
    drafts.map(async (draft) => {
      const loaded = await loadDraft(draft.draftId);
      return loaded ? toDraftVersion(draft, loaded.record) : null;
    })
  );
  const readyVersions = entries.map(toReadyVersion);
  return reconcileLocalVersionSnapshots([...readyVersions, ...draftVersions.filter((v): v is DrillVersionSnapshot => Boolean(v))]).sort(
    (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime()
  );
}

async function listCloudVersions(session: AuthSession): Promise<DrillVersionSnapshot[]> {
  const libraryResult = await listHostedLibrary(session);
  if (!libraryResult.ok) {
    throw new Error(libraryResult.error);
  }

  return libraryResult.value
    .map((item) => {
      const pkg = ensureVersioningMetadata(item.content);
      return {
        versionId: pkg.manifest.versioning?.versionId ?? item.id,
        drillId: item.packageId,
        versionNumber: parseVersionNumber(pkg),
        status: statusFromPackage(pkg),
        isPublished: pkg.manifest.publishing?.publishStatus === "published",
        createdAtIso: item.createdAtIso,
        updatedAtIso: item.updatedAtIso,
        title: item.title,
        packageJson: pkg,
        source: statusFromPackage(pkg) === "draft" ? ("draft" as const) : ("library" as const),
        sourceId: item.id
      } satisfies DrillVersionSnapshot;
    })
    .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());
}

async function listAllVersions(context?: DrillRepositoryContext): Promise<DrillVersionSnapshot[]> {
  const resolved = asContext(context);
  if (isCloudContext(resolved)) {
    return listCloudVersions(resolved.session);
  }
  return listLocalVersions();
}

function selectEditableVersion(versions: DrillVersionSnapshot[]): DrillVersionSnapshot | null {
  return versions.find((version) => version.status === "draft") ?? versions.find((version) => version.status === "ready") ?? versions[0] ?? null;
}

export async function loadVersionById(versionId: string, context?: DrillRepositoryContext): Promise<DrillVersionSnapshot | null> {
  const versions = await listAllVersions(context);
  return versions.find((version) => version.versionId === versionId) ?? null;
}

export async function loadEditableVersionForDrill(drillId: string, context?: DrillRepositoryContext): Promise<DrillVersionSnapshot | null> {
  const resolved = asContext(context);
  const existingVersions = await listVersionsForDrill(drillId, resolved);
  const editable = selectEditableVersion(existingVersions);
  if (!editable) {
    return null;
  }

  if (editable.status === "draft") {
    return editable;
  }

  await createDraftVersion(drillId, resolved);
  const refreshed = await listVersionsForDrill(drillId, resolved);
  return refreshed.find((version) => version.status === "draft") ?? editable;
}

export async function listVersionsForDrill(drillId: string, context?: DrillRepositoryContext): Promise<DrillVersionSnapshot[]> {
  const versions = await listAllVersions(context);
  return versions.filter((version) => version.drillId === drillId);
}

export async function listDrillsWithActiveVersion(context?: DrillRepositoryContext): Promise<DrillLibraryItem[]> {
  const versions = await listAllVersions(context);
  const drillIds = new Set(versions.map((version) => version.drillId));

  const drills = Array.from(drillIds).map((drillId) => {
    const drillVersions = versions.filter((version) => version.drillId === drillId);
    const currentVersion = drillVersions[0];
    if (!currentVersion) {
      return null;
    }
    const activeReadyVersion = drillVersions.find((version) => version.status === "ready") ?? null;
    const latestDraftVersion = drillVersions.find((version) => version.status === "draft") ?? null;

    return {
      drillId,
      title: currentVersion.title,
      currentVersionId: currentVersion.versionId,
      activeReadyVersionId: activeReadyVersion?.versionId ?? null,
      latestDraftVersionId: latestDraftVersion?.versionId ?? null,
      currentVersion,
      activeReadyVersion,
      updatedAtIso: currentVersion.updatedAtIso
    } satisfies DrillLibraryItem;
  });

  return drills.filter((item): item is DrillLibraryItem => item !== null).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

export async function createDrill(context?: DrillRepositoryContext): Promise<{ drillId: string; draftVersionId: string }> {
  const resolved = asContext(context);
  const now = new Date().toISOString();
  const draftId = createUniqueId("draft");
  const drillId = createUniqueId("drill");
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

  if (isCloudContext(resolved)) {
    const saved = await upsertHostedLibraryItem(resolved.session, pkg);
    if (!saved.ok) {
      throw new Error(saved.error);
    }
    return { drillId, draftVersionId: pkg.manifest.versioning.versionId };
  }

  try {
    await saveDraft({ draftId, sourceLabel: "authored-local", packageJson: pkg, assetsById: {} });
  } catch (error) {
    throw mapLocalPersistenceError(error);
  }
  return { drillId, draftVersionId: draftId };
}

export async function createDraftVersion(drillId: string, context?: DrillRepositoryContext): Promise<{ draftVersionId: string; resumed: boolean }> {
  const versions = await listVersionsForDrill(drillId, context);
  const existingDraft = versions.find((version) => version.status === "draft");
  if (existingDraft) {
    return { draftVersionId: existingDraft.versionId, resumed: true };
  }

  const activeReady = versions.find((version) => version.status === "ready");
  if (!activeReady) {
    throw new Error("No base ready version exists for this drill yet.");
  }

  const nextDraftId = createUniqueId("draft");
  const next = ensureVersioningMetadata(structuredClone(activeReady.packageJson));
  next.manifest.packageVersion = bumpPatchVersion(activeReady.packageJson.manifest.packageVersion);
  next.manifest.updatedAtIso = new Date().toISOString();
  next.manifest.versioning = {
    ...(next.manifest.versioning ?? {}),
    packageSlug: next.manifest.versioning?.packageSlug ?? next.manifest.packageId,
    versionId: nextDraftId,
    revision: (next.manifest.versioning?.revision ?? parseVersionNumber(next)) + 1,
    lineageId: next.manifest.versioning?.lineageId ?? next.manifest.packageId,
    draftStatus: "draft",
    derivedFrom: {
      relation: "new-version",
      parentPackageId: activeReady.packageJson.manifest.packageId,
      parentVersionId: activeReady.packageJson.manifest.versioning?.versionId ?? activeReady.packageJson.manifest.packageVersion,
      note: activeReady.isPublished ? "Derived from published ready version." : "Derived from ready version."
    }
  };

  const resolved = asContext(context);
  if (isCloudContext(resolved)) {
    const saved = await upsertHostedLibraryItem(resolved.session, next);
    if (!saved.ok) {
      throw new Error(saved.error);
    }
    return { draftVersionId: nextDraftId, resumed: false };
  }

  await saveDraft({ draftId: nextDraftId, sourceLabel: `new-version:${activeReady.versionId}`, packageJson: next, assetsById: {} });
  return { draftVersionId: nextDraftId, resumed: false };
}

export async function deleteDrill(drillId: string, context?: DrillRepositoryContext): Promise<void> {
  const resolved = asContext(context);
  const versions = await listVersionsForDrill(drillId, resolved);

  if (isCloudContext(resolved)) {
    const hosted = await listHostedLibrary(resolved.session);
    if (!hosted.ok) {
      throw new Error(hosted.error);
    }

    const rows = hosted.value.filter((item) => item.packageId === drillId);
    await Promise.all(
      rows.map(async (row) => {
        const removed = await deleteHostedLibraryItem(resolved.session, row.id);
        if (!removed.ok) {
          throw new Error(removed.error);
        }
      })
    );
    return;
  }

  await Promise.all(versions.filter((version) => version.source === "draft").map((version) => deleteDraft(version.sourceId)));
  deleteRegistryEntriesByPackageId(drillId);
}

export async function markVersionReady(draftVersionId: string, context?: DrillRepositoryContext): Promise<void> {
  const resolved = asContext(context);

  if (isCloudContext(resolved)) {
    const loaded = await loadVersionById(draftVersionId, resolved);
    if (!loaded) {
      throw new Error("Draft version could not be loaded.");
    }

    const pkg = ensureVersioningMetadata(structuredClone(loaded.packageJson));
    pkg.manifest.versioning = {
      ...(pkg.manifest.versioning ?? {}),
      packageSlug: pkg.manifest.versioning?.packageSlug ?? pkg.manifest.packageId,
      versionId: `${pkg.manifest.packageId}@${pkg.manifest.packageVersion}`,
      revision: pkg.manifest.versioning?.revision ?? parseVersionNumber(pkg),
      lineageId: pkg.manifest.versioning?.lineageId ?? pkg.manifest.packageId,
      draftStatus: "publish-ready"
    };
    pkg.manifest.updatedAtIso = new Date().toISOString();

    const upserted = await upsertHostedLibraryItem(resolved.session, pkg);
    if (!upserted.ok) {
      throw new Error(upserted.error);
    }
    return;
  }

  const loaded = await loadDraft(draftVersionId);
  if (!loaded) {
    throw new Error("Draft version could not be loaded.");
  }

  const pkg = ensureVersioningMetadata(structuredClone(loaded.record.packageJson));
  pkg.manifest.versioning = {
    ...(pkg.manifest.versioning ?? {}),
    packageSlug: pkg.manifest.versioning?.packageSlug ?? pkg.manifest.packageId,
    versionId: `${pkg.manifest.packageId}@${pkg.manifest.packageVersion}`,
    revision: pkg.manifest.versioning?.revision ?? parseVersionNumber(pkg),
    lineageId: pkg.manifest.versioning?.lineageId ?? pkg.manifest.packageId,
    draftStatus: "publish-ready"
  };
  pkg.manifest.updatedAtIso = new Date().toISOString();

  upsertRegistryEntryFromPackage({ packageJson: pkg, sourceType: "authored-local", sourceLabel: `ready-from:${draftVersionId}` });
  await deleteDraft(draftVersionId);
}

export async function publishVersion(version: DrillVersionSnapshot, context?: DrillRepositoryContext): Promise<void> {
  if (version.status !== "ready") {
    throw new Error("Only Ready versions can be published.");
  }

  const pkg = ensureVersioningMetadata(structuredClone(version.packageJson));
  pkg.manifest.publishing = { ...(pkg.manifest.publishing ?? {}), publishStatus: "published" };
  pkg.manifest.updatedAtIso = new Date().toISOString();

  const resolved = asContext(context);
  if (isCloudContext(resolved)) {
    const upserted = await upsertHostedLibraryItem(resolved.session, pkg);
    if (!upserted.ok) {
      throw new Error(upserted.error);
    }
    return;
  }

  upsertRegistryEntryFromPackage({
    packageJson: pkg,
    sourceType: "mock-published",
    sourceLabel: `published-from:${version.versionId}`,
    publishedAtIso: new Date().toISOString(),
    existingEntryId: version.source === "library" ? version.sourceId : undefined
  });
}

export async function listReadyDrillsForUpload(
  context?: DrillRepositoryContext
): Promise<Array<{ drillId: string; title: string; versionId: string; packageJson: DrillPackage; isPublished: boolean }>> {
  const drills = await listDrillsWithActiveVersion(context);
  return drills
    .filter((drill) => Boolean(drill.activeReadyVersion))
    .map((drill) => ({
      drillId: drill.drillId,
      title: drill.title,
      versionId: drill.activeReadyVersion?.versionId ?? drill.currentVersionId,
      packageJson: drill.activeReadyVersion?.packageJson ?? drill.currentVersion.packageJson,
      isPublished: Boolean(drill.activeReadyVersion?.isPublished)
    }));
}
