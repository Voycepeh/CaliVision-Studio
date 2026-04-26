import test from "node:test";
import assert from "node:assert/strict";
import { parseCompareIntentFromObject, parseCompareIntentFromSearchParams } from "./intent.ts";

test("parseCompareIntentFromSearchParams reads supported query params", () => {
  const params = new URLSearchParams("attemptId=attempt_1&drillId=drill_pushup&compareTo=latest");
  const parsed = parseCompareIntentFromSearchParams(params);

  assert.deepEqual(parsed, {
    attemptId: "attempt_1",
    drillId: "drill_pushup",
    compareTo: "latest"
  });
});

test("parseCompareIntentFromSearchParams drops unsupported compareTo", () => {
  const params = new URLSearchParams("attemptId=attempt_1&compareTo=something_else");
  const parsed = parseCompareIntentFromSearchParams(params);

  assert.deepEqual(parsed, {
    attemptId: "attempt_1",
    drillId: undefined,
    compareTo: undefined
  });
});


test("parseCompareIntentFromObject reads server searchParams shape", () => {
  const parsed = parseCompareIntentFromObject({
    attemptId: "attempt_9",
    drillId: ["drill_plank"],
    compareTo: "personalBest"
  });

  assert.deepEqual(parsed, {
    attemptId: "attempt_9",
    drillId: "drill_plank",
    compareTo: "personalBest"
  });
});
