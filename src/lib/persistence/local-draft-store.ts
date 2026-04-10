import { ensureVersioningMetadata } from "@/lib/package";
import type { DrillPackage } from "@/lib/schema/contracts";
import { refreshKnowledgeForPackage } from "@/lib/knowledge";

const DB_NAME = "calivision.studio.local";
const DB_VERSION = 2;
const DRAFT_STORE = "drafts";
const ASSET_STORE = "assets";
const META_STORE = "meta";
const LAST_OPENED_KEY = "last-opened-draft-id";

export type LocalDraftStatus = "local-draft" | "imported-draft" | "derived-draft";

export type LocalDraftRecord = {
  draftId: string;
  title: string;
  packageId: string;
  packageVersion: string;
  sourceLabel: string;
  status: LocalDraftStatus;
  packageJson: DrillPackage;
  createdAtIso: string;
  updatedAtIso: string;
  lastOpenedAtIso: string;
};

export type LocalDraftSummary = {
  draftId: string;
  title: string;
  packageId: string;
  packageVersion: string;
  sourceLabel: string;
  status: LocalDraftStatus;
  phaseCount: number;
  hasAssets: boolean;
  createdAtIso: string;
  updatedAtIso: string;
  lastOpenedAtIso: string;
};

export type LocalDraftAssetRecord = {
  key: string;
  draftId: string;
  assetId: string;
  mimeType: string;
  blob: Blob;
  updatedAtIso: string;
};

export type DraftSaveResult = {
  ok: boolean;
  draftId: string;
  updatedAtIso: string;
  assetCount: number;
  warning?: string;
};

export class LocalDraftPersistenceError extends Error {}

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new LocalDraftPersistenceError("IndexedDB is unavailable in this browser context.");
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new LocalDraftPersistenceError("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new LocalDraftPersistenceError("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new LocalDraftPersistenceError("IndexedDB transaction failed."));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

async function openDatabase(): Promise<IDBDatabase> {
  assertBrowser();

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE, { keyPath: "draftId" });
        }

        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          const assets = db.createObjectStore(ASSET_STORE, { keyPath: "key" });
          assets.createIndex("draftId", "draftId", { unique: false });
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new LocalDraftPersistenceError("Failed to open local draft database."));
    });
  }

  return dbPromise;
}

function toStatus(sourceLabel: string): LocalDraftStatus {
  if (sourceLabel.startsWith("local-file:")) {
    return "imported-draft";
  }

  if (sourceLabel.startsWith("fork:") || sourceLabel.startsWith("duplicate:") || sourceLabel.startsWith("new-version:")) {
    return "derived-draft";
  }

  return "local-draft";
}

function toSummary(record: LocalDraftRecord): LocalDraftSummary {
  const phaseCount = record.packageJson.drills[0]?.phases.length ?? 0;
  const hasAssets = record.packageJson.assets.length > 0;

  return {
    draftId: record.draftId,
    title: record.title,
    packageId: record.packageId,
    packageVersion: record.packageVersion,
    sourceLabel: record.sourceLabel,
    status: record.status,
    phaseCount,
    hasAssets,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
    lastOpenedAtIso: record.lastOpenedAtIso
  };
}

function normalizeDraftPackage(packageJson: DrillPackage, draftId: string): DrillPackage {
  const normalized = ensureVersioningMetadata(packageJson);
  normalized.manifest.versioning = {
    ...(normalized.manifest.versioning ?? {}),
    packageSlug: normalized.manifest.versioning?.packageSlug ?? normalized.manifest.packageId,
    lineageId: normalized.manifest.versioning?.lineageId ?? normalized.manifest.packageId,
    revision: Math.max(1, normalized.manifest.versioning?.revision ?? 1),
    versionId: draftId,
    draftStatus: "draft"
  };
  return normalized;
}

export async function saveDraft(input: {
  draftId: string;
  sourceLabel: string;
  packageJson: DrillPackage;
  assetsById: Record<string, Blob>;
}): Promise<DraftSaveResult> {
  const db = await openDatabase();
  const nowIso = new Date().toISOString();
  const normalizedPackage = normalizeDraftPackage(input.packageJson, input.draftId);
  const title = normalizedPackage.drills[0]?.title || normalizedPackage.manifest.packageId;

  const tx = db.transaction([DRAFT_STORE, ASSET_STORE], "readwrite");
  const draftStore = tx.objectStore(DRAFT_STORE);
  const assetStore = tx.objectStore(ASSET_STORE);

  const existing = (await requestToPromise(draftStore.get(input.draftId))) as LocalDraftRecord | undefined;

  const record: LocalDraftRecord = {
    draftId: input.draftId,
    title,
    packageId: normalizedPackage.manifest.packageId,
    packageVersion: normalizedPackage.manifest.packageVersion,
    sourceLabel: input.sourceLabel,
    status: toStatus(input.sourceLabel),
    packageJson: normalizedPackage,
    createdAtIso: existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
    lastOpenedAtIso: existing?.lastOpenedAtIso ?? nowIso
  };

  draftStore.put(record);

  const index = assetStore.index("draftId");
  const existingAssets = (await requestToPromise(index.getAll(IDBKeyRange.only(input.draftId)))) as LocalDraftAssetRecord[];
  const existingKeys = new Set(existingAssets.map((asset) => asset.key));

  for (const [assetId, blob] of Object.entries(input.assetsById)) {
    const key = `${input.draftId}:${assetId}`;
    existingKeys.delete(key);
    const asset: LocalDraftAssetRecord = {
      key,
      draftId: input.draftId,
      assetId,
      mimeType: blob.type || "application/octet-stream",
      blob,
      updatedAtIso: nowIso
    };
    assetStore.put(asset);
  }

  existingKeys.forEach((key) => {
    assetStore.delete(key);
  });

  await transactionDone(tx);

  void refreshKnowledgeForPackage({ packageJson: normalizedPackage });

  return {
    ok: true,
    draftId: input.draftId,
    updatedAtIso: nowIso,
    assetCount: Object.keys(input.assetsById).length
  };
}

export async function loadDraft(draftId: string): Promise<{ record: LocalDraftRecord; assetsById: Record<string, Blob> } | null> {
  const db = await openDatabase();
  const tx = db.transaction([DRAFT_STORE, ASSET_STORE], "readwrite");
  const draftStore = tx.objectStore(DRAFT_STORE);
  const assetStore = tx.objectStore(ASSET_STORE);
  const record = (await requestToPromise(draftStore.get(draftId))) as LocalDraftRecord | undefined;

  if (!record) {
    await transactionDone(tx);
    return null;
  }

  const normalizedPackage = normalizeDraftPackage(record.packageJson, draftId);
  const needsMigration = normalizedPackage.manifest.versioning?.versionId !== record.packageJson.manifest.versioning?.versionId;
  const nextRecord = needsMigration
    ? {
        ...record,
        packageVersion: normalizedPackage.manifest.packageVersion,
        packageJson: normalizedPackage,
        updatedAtIso: new Date().toISOString()
      }
    : record;
  if (needsMigration) {
    draftStore.put(nextRecord);
  }

  const index = assetStore.index("draftId");
  const assets = (await requestToPromise(index.getAll(IDBKeyRange.only(draftId)))) as LocalDraftAssetRecord[];
  await transactionDone(tx);

  return {
    record: nextRecord,
    assetsById: Object.fromEntries(assets.map((asset) => [asset.assetId, asset.blob]))
  };
}

export async function loadDraftList(): Promise<LocalDraftSummary[]> {
  const db = await openDatabase();
  const tx = db.transaction(DRAFT_STORE, "readwrite");
  const store = tx.objectStore(DRAFT_STORE);
  const records = (await requestToPromise(store.getAll())) as LocalDraftRecord[];
  const normalizedRecords = records.map((record) => {
    const normalizedPackage = normalizeDraftPackage(record.packageJson, record.draftId);
    const changed = normalizedPackage.manifest.versioning?.versionId !== record.packageJson.manifest.versioning?.versionId;
    const normalizedRecord: LocalDraftRecord = changed
      ? {
          ...record,
          packageVersion: normalizedPackage.manifest.packageVersion,
          packageJson: normalizedPackage,
          updatedAtIso: new Date().toISOString()
        }
      : {
          ...record,
          packageJson: normalizedPackage
        };
    if (changed) {
      store.put(normalizedRecord);
    }
    return normalizedRecord;
  });
  await transactionDone(tx);

  return normalizedRecords.map(toSummary).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

export async function deleteDraft(draftId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([DRAFT_STORE, ASSET_STORE, META_STORE], "readwrite");
  const draftStore = tx.objectStore(DRAFT_STORE);
  const assetStore = tx.objectStore(ASSET_STORE);
  const metaStore = tx.objectStore(META_STORE);
  draftStore.delete(draftId);

  const index = assetStore.index("draftId");
  const assets = (await requestToPromise(index.getAll(IDBKeyRange.only(draftId)))) as LocalDraftAssetRecord[];
  assets.forEach((asset) => assetStore.delete(asset.key));

  const lastOpened = (await requestToPromise(metaStore.get(LAST_OPENED_KEY))) as { key: string; value: string } | undefined;
  if (lastOpened?.value === draftId) {
    metaStore.put({ key: LAST_OPENED_KEY, value: "" });
  }

  await transactionDone(tx);
}


export async function deleteDraftsForPackage(packageId: string, packageVersion: string): Promise<number> {
  const summaries = await loadDraftList();
  const matches = summaries.filter((draft) => draft.packageId === packageId && draft.packageVersion === packageVersion);
  await Promise.all(matches.map((draft) => deleteDraft(draft.draftId)));
  return matches.length;
}

export async function duplicateDraft(draftId: string): Promise<string> {
  const loaded = await loadDraft(draftId);
  if (!loaded) {
    throw new LocalDraftPersistenceError("Draft not found.");
  }

  const nextDraftId = `${loaded.record.packageId}-${Date.now()}`;
  const nextPackage = ensureVersioningMetadata(structuredClone(loaded.record.packageJson));

  await saveDraft({
    draftId: nextDraftId,
    sourceLabel: "duplicate:local-draft",
    packageJson: nextPackage,
    assetsById: loaded.assetsById
  });

  return nextDraftId;
}

export async function renameDraft(draftId: string, title: string): Promise<void> {
  const loaded = await loadDraft(draftId);
  if (!loaded) {
    throw new LocalDraftPersistenceError("Draft not found.");
  }

  const next = structuredClone(loaded.record.packageJson);
  if (next.drills[0]) {
    next.drills[0].title = title;
  }

  await saveDraft({
    draftId,
    sourceLabel: loaded.record.sourceLabel,
    packageJson: next,
    assetsById: loaded.assetsById
  });
}

export async function setLastOpenedDraft(draftId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([META_STORE, DRAFT_STORE], "readwrite");
  tx.objectStore(META_STORE).put({ key: LAST_OPENED_KEY, value: draftId });

  const draftStore = tx.objectStore(DRAFT_STORE);
  const existing = (await requestToPromise(draftStore.get(draftId))) as LocalDraftRecord | undefined;
  if (existing) {
    draftStore.put({ ...existing, lastOpenedAtIso: new Date().toISOString() });
  }

  await transactionDone(tx);
}

export async function getLastOpenedDraft(): Promise<string | null> {
  const db = await openDatabase();
  const tx = db.transaction(META_STORE, "readonly");
  const meta = (await requestToPromise(tx.objectStore(META_STORE).get(LAST_OPENED_KEY))) as { key: string; value: string } | undefined;
  await transactionDone(tx);

  return meta?.value || null;
}
