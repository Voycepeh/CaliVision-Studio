import test from "node:test";
import assert from "node:assert/strict";
import { resolveAttemptHistoryRepositoryForSession } from "./repository.ts";
import { LocalStorageAttemptHistoryRepository } from "./repository.ts";
import { SupabaseAttemptHistoryRepository } from "./hosted-repository.ts";

test("resolveAttemptHistoryRepositoryForSession returns local repository when signed out", () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const memory = new Map<string, string>();
  (globalThis as { window: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      }
    } as Storage
  };

  try {
    const repository = resolveAttemptHistoryRepositoryForSession(null);
    assert.equal(repository instanceof LocalStorageAttemptHistoryRepository, true);
  } finally {
    if (typeof previousWindow === "undefined") {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
});

test("resolveAttemptHistoryRepositoryForSession returns hosted repository when signed in", () => {
  const repository = resolveAttemptHistoryRepositoryForSession({
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: null,
    user: {
      id: "user-1",
      email: "demo@example.com"
    }
  });
  assert.equal(repository instanceof SupabaseAttemptHistoryRepository, true);
});
