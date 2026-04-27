import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workspacePath = join(process.cwd(), "src/components/upload/UploadVideoWorkspace.tsx");
const workspaceSource = readFileSync(workspacePath, "utf8");

const selectedDrillCardOccurrences = (workspaceSource.match(/<UploadSelectedDrillCard/g) ?? []).length;

test("upload workflow keeps one selected-drill presentation surface", () => {
  assert.equal(selectedDrillCardOccurrences, 1);
  assert.equal(workspaceSource.includes("Upload setup guidance"), true);
});

test("upload right pane no longer renders duplicate reference drill card content", () => {
  assert.equal(workspaceSource.includes("ReferenceAnimationPanel"), false);
  assert.equal(workspaceSource.includes("Workflow order: choose drill, verify setup, choose video, then analyze."), true);
});
