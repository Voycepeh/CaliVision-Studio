import type { AnalysisEvent, AnalysisSummaryMetrics, FramePhaseSample } from "../schema/contracts.ts";

export type AnalysisSourceKind = "upload" | "live" | "debug" | "imported";
export type AnalysisSessionStatus = "pending" | "completed" | "failed" | "cancelled";

export type AnalysisSessionRecord = {
  sessionId: string;
  drillId: string;
  drillTitle?: string;
  drillVersion?: string;
  pipelineVersion?: string;
  sourceKind: AnalysisSourceKind;
  sourceId?: string;
  sourceUri?: string;
  sourceLabel?: string;
  status: AnalysisSessionStatus;
  createdAtIso: string;
  completedAtIso?: string;
  rawVideoUri?: string;
  annotatedVideoUri?: string;
  summary: AnalysisSummaryMetrics;
  frameSamples: FramePhaseSample[];
  events: AnalysisEvent[];
  qualitySummary?: {
    confidenceAvg?: number;
    lowConfidenceFrames?: number;
  };
  debug?: {
    errorMessage?: string;
    detector?: string;
    cadenceFps?: number;
    sourceVideoFileName?: string;
  };
};

export type AnalysisSessionExport = {
  schemaVersion: "analysis-session-record-v1";
  session: AnalysisSessionRecord;
};

export type ListSessionsOptions = {
  limit?: number;
};

export interface AnalysisSessionRepository {
  saveSession(session: AnalysisSessionRecord): Promise<void>;
  getSessionById(sessionId: string): Promise<AnalysisSessionRecord | null>;
  listSessionsByDrillId(drillId: string, options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]>;
  listRecentSessions(options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]>;
  deleteSession(sessionId: string): Promise<boolean>;
}

function sortByRecent(a: AnalysisSessionRecord, b: AnalysisSessionRecord): number {
  return b.createdAtIso.localeCompare(a.createdAtIso);
}

function applyLimit(sessions: AnalysisSessionRecord[], limit?: number): AnalysisSessionRecord[] {
  return typeof limit === "number" ? sessions.slice(0, limit) : sessions;
}

export class InMemoryAnalysisSessionRepository implements AnalysisSessionRepository {
  private records = new Map<string, AnalysisSessionRecord>();

  async saveSession(session: AnalysisSessionRecord): Promise<void> {
    this.records.set(session.sessionId, structuredClone(session));
  }

  async getSessionById(sessionId: string): Promise<AnalysisSessionRecord | null> {
    const session = this.records.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async listSessionsByDrillId(drillId: string, options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]> {
    const sessions = Array.from(this.records.values()).filter((session) => session.drillId === drillId).sort(sortByRecent);
    return structuredClone(applyLimit(sessions, options?.limit));
  }

  async listRecentSessions(options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]> {
    const sessions = Array.from(this.records.values()).sort(sortByRecent);
    return structuredClone(applyLimit(sessions, options?.limit));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.records.delete(sessionId);
  }
}

const DB_NAME = "calivision.studio.local";
const DB_VERSION = 2;
const STORE_NAME = "analysis-sessions";

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this browser context.");
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
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

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
          store.createIndex("drillId", "drillId", { unique: false });
          store.createIndex("createdAtIso", "createdAtIso", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open analysis sessions database."));
    });
  }

  return dbPromise;
}

export class IndexedDbAnalysisSessionRepository implements AnalysisSessionRepository {
  async saveSession(session: AnalysisSessionRecord): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    await transactionDone(tx);
  }

  async getSessionById(sessionId: string): Promise<AnalysisSessionRecord | null> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readonly");
    const session = (await requestToPromise(tx.objectStore(STORE_NAME).get(sessionId))) as AnalysisSessionRecord | undefined;
    await transactionDone(tx);
    return session ?? null;
  }

  async listSessionsByDrillId(drillId: string, options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("drillId");
    const sessions = (await requestToPromise(index.getAll(IDBKeyRange.only(drillId)))) as AnalysisSessionRecord[];
    await transactionDone(tx);
    return applyLimit(sessions.sort(sortByRecent), options?.limit);
  }

  async listRecentSessions(options?: ListSessionsOptions): Promise<AnalysisSessionRecord[]> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readonly");
    const sessions = (await requestToPromise(tx.objectStore(STORE_NAME).getAll())) as AnalysisSessionRecord[];
    await transactionDone(tx);
    return applyLimit(sessions.sort(sortByRecent), options?.limit);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const existing = await this.getSessionById(sessionId);
    if (!existing) {
      return false;
    }

    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(sessionId);
    await transactionDone(tx);
    return true;
  }
}

let browserRepository: AnalysisSessionRepository | null = null;

export function getBrowserAnalysisSessionRepository(): AnalysisSessionRepository {
  if (!browserRepository) {
    browserRepository = new IndexedDbAnalysisSessionRepository();
  }

  return browserRepository;
}

export function serializeAnalysisSession(session: AnalysisSessionRecord): string {
  const payload: AnalysisSessionExport = {
    schemaVersion: "analysis-session-record-v1",
    session
  };

  return JSON.stringify(payload, null, 2);
}

export function deserializeAnalysisSession(value: string): AnalysisSessionRecord {
  const parsed = JSON.parse(value) as AnalysisSessionExport;
  if (parsed.schemaVersion !== "analysis-session-record-v1") {
    throw new Error("Unsupported analysis session export schema version.");
  }

  if (!parsed.session?.sessionId || !parsed.session.drillId || !parsed.session.createdAtIso) {
    throw new Error("Invalid analysis session export payload.");
  }

  return parsed.session;
}

export function createImportedAnalysisSessionCopy(
  session: AnalysisSessionRecord,
  options?: { nowIso?: string; importedSessionId?: string }
): AnalysisSessionRecord {
  const nowIso = options?.nowIso ?? new Date().toISOString();
  return {
    ...session,
    sessionId: options?.importedSessionId ?? `analysis_imported_${Date.now()}`,
    sourceKind: "imported",
    sourceId: session.sessionId,
    sourceLabel: session.sourceLabel ? `imported:${session.sourceLabel}` : `imported:${session.sessionId}`,
    status: "completed",
    createdAtIso: nowIso,
    completedAtIso: nowIso
  };
}
