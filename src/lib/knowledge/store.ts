import type { DrillPackage } from "@/lib/schema/contracts";
import { buildDrillKnowledgeDocument } from "./generator";
import type { DrillKnowledgeDocument } from "./types";

const KNOWLEDGE_STORAGE_KEY = "calivision.knowledge.v1";

type PersistedKnowledgeIndex = {
  recordsByKey: Record<string, DrillKnowledgeDocument>;
};

function makeRecordKey(drillId: string, drillVersionId?: string): string {
  return `${drillId}::${drillVersionId ?? "latest"}`;
}

function makePackageRecordKey(pkg: DrillPackage): string {
  const drillId = pkg.drills[0]?.drillId ?? pkg.manifest.packageId;
  const drillVersionId = pkg.manifest.versioning?.versionId ?? pkg.manifest.packageVersion;
  return makeRecordKey(drillId, drillVersionId);
}

function emptyIndex(): PersistedKnowledgeIndex {
  return { recordsByKey: {} };
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadKnowledgeIndex(): PersistedKnowledgeIndex {
  if (!canUseLocalStorage()) {
    return emptyIndex();
  }

  const raw = window.localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
  if (!raw) {
    return emptyIndex();
  }

  try {
    const parsed = JSON.parse(raw) as PersistedKnowledgeIndex;
    if (!parsed || typeof parsed !== "object" || !parsed.recordsByKey || typeof parsed.recordsByKey !== "object") {
      return emptyIndex();
    }
    return parsed;
  } catch {
    return emptyIndex();
  }
}

function saveKnowledgeIndex(index: PersistedKnowledgeIndex): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(index));
}

export function upsertKnowledgeDocument(doc: DrillKnowledgeDocument): void {
  const index = loadKnowledgeIndex();
  index.recordsByKey[makeRecordKey(doc.drillId, doc.drillVersionId)] = doc;
  saveKnowledgeIndex(index);
}

export function getKnowledgeDocument(drillId: string, drillVersionId?: string): DrillKnowledgeDocument | null {
  const index = loadKnowledgeIndex();
  const exact = index.recordsByKey[makeRecordKey(drillId, drillVersionId)];
  if (exact) {
    return exact;
  }

  if (!drillVersionId) {
    return null;
  }

  const fallback = index.recordsByKey[makeRecordKey(drillId, "latest")];
  return fallback ?? null;
}

export function refreshKnowledgeForPackage(input: {
  packageJson: DrillPackage;
  candidatePackages?: DrillPackage[];
}): DrillKnowledgeDocument | null {
  try {
    const document = buildDrillKnowledgeDocument(input);
    upsertKnowledgeDocument(document);
    return document;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[knowledge] Failed to generate drill knowledge document", {
        packageId: input.packageJson.manifest.packageId,
        versionId: input.packageJson.manifest.versioning?.versionId ?? input.packageJson.manifest.packageVersion,
        error
      });
    }
    return null;
  }
}

export function getOrBuildKnowledgeForPackage(input: {
  packageJson: DrillPackage;
  candidatePackages?: DrillPackage[];
}): DrillKnowledgeDocument {
  const pkg = input.packageJson;
  const drillId = pkg.drills[0]?.drillId ?? pkg.manifest.packageId;
  const drillVersionId = pkg.manifest.versioning?.versionId ?? pkg.manifest.packageVersion;

  const cached = getKnowledgeDocument(drillId, drillVersionId);
  if (cached && cached.updatedAt === pkg.manifest.updatedAtIso) {
    return cached;
  }

  const rebuilt = refreshKnowledgeForPackage(input);
  if (rebuilt) {
    return rebuilt;
  }

  return buildDrillKnowledgeDocument(input);
}

export function refreshKnowledgeForPackages(packages: DrillPackage[]): void {
  packages.forEach((pkg) => {
    void refreshKnowledgeForPackage({ packageJson: pkg, candidatePackages: packages });
  });
}

export function getKnowledgeRecordKeyForPackage(packageJson: DrillPackage): string {
  return makePackageRecordKey(packageJson);
}
