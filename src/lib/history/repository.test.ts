import test from "node:test";
import assert from "node:assert/strict";
import { LocalStorageAttemptHistoryRepository } from "./repository.ts";
import type { SavedAttemptSummary } from "./types.ts";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function makeAttempt(id: string, createdAt: string, drillId = "drill_1"): SavedAttemptSummary {
  return {
    id,
    createdAt,
    source: "upload",
    drillId,
    drillTitle: "Push-up",
    movementType: "REP",
    repsCounted: 5,
    status: "completed",
    analysisModelVersion: "analysis-review-v1"
  };
}

test("LocalStorageAttemptHistoryRepository saves and lists attempts by recency", async () => {
  const repository = new LocalStorageAttemptHistoryRepository({ storage: new MemoryStorage(), cap: 100 });
  await repository.saveAttempt(makeAttempt("a1", "2026-04-26T10:00:00.000Z"));
  await repository.saveAttempt(makeAttempt("a2", "2026-04-26T11:00:00.000Z"));

  const recent = await repository.listRecentAttempts();
  assert.deepEqual(recent.map((attempt) => attempt.id), ["a2", "a1"]);
});

test("LocalStorageAttemptHistoryRepository enforces retention cap", async () => {
  const repository = new LocalStorageAttemptHistoryRepository({ storage: new MemoryStorage(), cap: 2 });
  await repository.saveAttempt(makeAttempt("a1", "2026-04-26T10:00:00.000Z"));
  await repository.saveAttempt(makeAttempt("a2", "2026-04-26T11:00:00.000Z"));
  await repository.saveAttempt(makeAttempt("a3", "2026-04-26T12:00:00.000Z"));

  const recent = await repository.listRecentAttempts();
  assert.deepEqual(recent.map((attempt) => attempt.id), ["a3", "a2"]);
});

test("LocalStorageAttemptHistoryRepository filters by drill and supports delete", async () => {
  const repository = new LocalStorageAttemptHistoryRepository({ storage: new MemoryStorage(), cap: 10 });
  await repository.saveAttempt(makeAttempt("a1", "2026-04-26T10:00:00.000Z", "drill_1"));
  await repository.saveAttempt(makeAttempt("a2", "2026-04-26T11:00:00.000Z", "drill_2"));

  const filtered = await repository.listAttemptsByDrill("drill_2");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "a2");

  assert.equal(await repository.deleteAttempt("a2"), true);
  const afterDelete = await repository.listRecentAttempts();
  assert.deepEqual(afterDelete.map((attempt) => attempt.id), ["a1"]);
});


test("LocalStorageAttemptHistoryRepository clears all attempts", async () => {
  const repository = new LocalStorageAttemptHistoryRepository({ storage: new MemoryStorage(), cap: 10 });
  await repository.saveAttempt(makeAttempt("a1", "2026-04-26T10:00:00.000Z", "drill_1"));
  await repository.saveAttempt(makeAttempt("a2", "2026-04-26T11:00:00.000Z", "drill_2"));

  await repository.clearAttempts();

  const recent = await repository.listRecentAttempts();
  assert.equal(recent.length, 0);
});
