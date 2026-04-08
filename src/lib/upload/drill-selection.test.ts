import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectedDrillKey } from "./drill-selection.ts";

test("resolveSelectedDrillKey prefers current selection when available", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, "local:b", "seeded:a"), "local:b");
});

test("resolveSelectedDrillKey falls back to stored selection", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, null, "local:b"), "local:b");
});

test("resolveSelectedDrillKey falls back to first option when preferred key is missing", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, "hosted:c", "hosted:c"), "seeded:a");
});

