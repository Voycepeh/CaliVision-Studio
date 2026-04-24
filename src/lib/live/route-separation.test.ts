import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Upload Video and Live Training Cockpit remain separate routes", () => {
  const uploadPage = readFileSync("src/app/upload/page.tsx", "utf8");
  const livePage = readFileSync("src/app/live/page.tsx", "utf8");

  assert.ok(uploadPage.includes("Upload Video"));
  assert.ok(!uploadPage.includes("Live Training Cockpit"));
  assert.ok(livePage.includes("Live Training Cockpit"));
});
