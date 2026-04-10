import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowDrillKey,
  parseActiveDrillContext,
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
