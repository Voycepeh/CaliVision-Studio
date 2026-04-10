import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_DRILL_CONTEXT_EVENT_NAME,
  buildWorkflowDrillKey,
  clearActiveDrillContext,
  parseActiveDrillContext,
  readActiveDrillContext,
  setActiveDrillContext,
  serializeActiveDrillContext,
  type ActiveDrillContext
} from "./drill-context.ts";

test("buildWorkflowDrillKey returns route-safe key", () => {
  const context: ActiveDrillContext = { drillId: "drill-123", sourceKind: "local", sourceId: "draft-123" };
  assert.equal(buildWorkflowDrillKey(context), "local:draft-123:drill-123");
});

test("serialize and parse active drill context round trips", () => {
  const context: ActiveDrillContext = { drillId: "drill-999", sourceKind: "hosted", sourceId: "item-999" };
  assert.deepEqual(parseActiveDrillContext(serializeActiveDrillContext(context)), context);
});

test("parseActiveDrillContext rejects malformed payloads", () => {
  assert.equal(parseActiveDrillContext("not-json"), null);
  assert.equal(parseActiveDrillContext(JSON.stringify({ sourceKind: "local", sourceId: "a" })), null);
});

test("set/clear active context emits event and updates storage when window is available", () => {
  const listeners = new Map<string, Array<() => void>>();
  const store = new Map<string, string>();
  const events: string[] = [];
  const originalWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      }
    },
    dispatchEvent(event: { type: string }) {
      events.push(event.type);
      for (const cb of listeners.get(event.type) ?? []) {
        cb();
      }
      return true;
    },
    addEventListener(type: string, cb: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), cb]);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((candidate) => candidate !== cb)
      );
    }
  } as unknown as Window & typeof globalThis;

  const context: ActiveDrillContext = { drillId: "drill-1", sourceKind: "local", sourceId: "draft-1" };
  setActiveDrillContext(context);
  assert.deepEqual(readActiveDrillContext(), context);
  clearActiveDrillContext();
  assert.equal(readActiveDrillContext(), null);
  assert.deepEqual(events, [ACTIVE_DRILL_CONTEXT_EVENT_NAME, ACTIVE_DRILL_CONTEXT_EVENT_NAME]);

  globalThis.window = originalWindow;
});
