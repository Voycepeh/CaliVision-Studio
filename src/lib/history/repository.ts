import type { SavedAttemptSummary } from "./types.ts";

export interface AttemptHistoryRepository {
  saveAttempt(attempt: SavedAttemptSummary): Promise<void>;
  listRecentAttempts(limit?: number): Promise<SavedAttemptSummary[]>;
  listAttemptsByDrill(drillId: string, limit?: number): Promise<SavedAttemptSummary[]>;
  deleteAttempt(attemptId: string): Promise<boolean>;
}

type RepositoryOptions = {
  storageKey?: string;
  cap?: number;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

const DEFAULT_STORAGE_KEY = "calivision.saved-attempts.v1";
const DEFAULT_CAP = 100;

function sortByRecent(attempts: SavedAttemptSummary[]): SavedAttemptSummary[] {
  return [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function readAttempts(storage: Pick<Storage, "getItem">, storageKey: string): SavedAttemptSummary[] {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedAttemptSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAttempts(storage: Pick<Storage, "setItem">, storageKey: string, attempts: SavedAttemptSummary[]) {
  storage.setItem(storageKey, JSON.stringify(attempts));
}

export class LocalStorageAttemptHistoryRepository implements AttemptHistoryRepository {
  private readonly storageKey: string;
  private readonly cap: number;
  private readonly storage: Pick<Storage, "getItem" | "setItem">;

  constructor(options?: RepositoryOptions) {
    this.storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
    this.cap = options?.cap ?? DEFAULT_CAP;
    this.storage = options?.storage ?? window.localStorage;
  }

  async saveAttempt(attempt: SavedAttemptSummary): Promise<void> {
    const existing = readAttempts(this.storage, this.storageKey).filter((item) => item.id !== attempt.id);
    const next = sortByRecent([attempt, ...existing]).slice(0, this.cap);
    writeAttempts(this.storage, this.storageKey, next);
  }

  async listRecentAttempts(limit?: number): Promise<SavedAttemptSummary[]> {
    const attempts = sortByRecent(readAttempts(this.storage, this.storageKey));
    return typeof limit === "number" ? attempts.slice(0, limit) : attempts;
  }

  async listAttemptsByDrill(drillId: string, limit?: number): Promise<SavedAttemptSummary[]> {
    const attempts = sortByRecent(readAttempts(this.storage, this.storageKey)).filter((attempt) => attempt.drillId === drillId);
    return typeof limit === "number" ? attempts.slice(0, limit) : attempts;
  }

  async deleteAttempt(attemptId: string): Promise<boolean> {
    const attempts = readAttempts(this.storage, this.storageKey);
    const next = attempts.filter((attempt) => attempt.id !== attemptId);
    if (next.length === attempts.length) {
      return false;
    }
    writeAttempts(this.storage, this.storageKey, next);
    return true;
  }
}

let browserRepository: AttemptHistoryRepository | null = null;

export function getBrowserAttemptHistoryRepository(): AttemptHistoryRepository {
  if (typeof window === "undefined") {
    throw new Error("Attempt history is only available in the browser.");
  }
  if (!browserRepository) {
    browserRepository = new LocalStorageAttemptHistoryRepository();
  }
  return browserRepository;
}
