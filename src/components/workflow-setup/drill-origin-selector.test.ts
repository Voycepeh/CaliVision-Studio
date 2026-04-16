import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/workflow-setup/DrillOriginSelector.tsx", "utf8");

test("outside pointer interaction closes the combobox", () => {
  assert.ok(source.includes("document.addEventListener(\"pointerdown\""));
  assert.ok(source.includes("!wrapperRef.current?.contains(event.target as Node)"));
  assert.ok(!source.includes("document.addEventListener(\"mousedown\""));
});
