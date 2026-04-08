import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionPersistenceMode } from "./session-mode.ts";

const mockSession = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: Date.now() + 10_000,
  user: { id: "user-1", email: "user@example.com" }
};

test("uses local mode when supabase is not configured", () => {
  const mode = resolveSessionPersistenceMode({ session: mockSession, isSupabaseConfigured: false });
  assert.equal(mode, "local");
});

test("uses local mode when signed out", () => {
  const mode = resolveSessionPersistenceMode({ session: null, isSupabaseConfigured: true });
  assert.equal(mode, "local");
});

test("uses cloud mode only when configured and signed in", () => {
  const mode = resolveSessionPersistenceMode({ session: mockSession, isSupabaseConfigured: true });
  assert.equal(mode, "cloud");
});
