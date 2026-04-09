import test from "node:test";
import assert from "node:assert/strict";
import { clearFileInputValue, nextUploadWorkflowResetKey } from "./workflow-reset.ts";

test("clearFileInputValue clears previously selected file values", () => {
  const input = { value: "C:\\fakepath\\sample.mp4" };
  clearFileInputValue(input);
  assert.equal(input.value, "");
});

test("clearFileInputValue is safe when no input is provided", () => {
  assert.doesNotThrow(() => clearFileInputValue(null));
  assert.doesNotThrow(() => clearFileInputValue(undefined));
});

test("nextUploadWorkflowResetKey increments key for repeated remounts", () => {
  let resetKey = 0;
  resetKey = nextUploadWorkflowResetKey(resetKey);
  resetKey = nextUploadWorkflowResetKey(resetKey);
  resetKey = nextUploadWorkflowResetKey(resetKey);
  assert.equal(resetKey, 3);
});
