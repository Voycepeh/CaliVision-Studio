import test from "node:test";
import assert from "node:assert/strict";
import { classifyCameraError, getCameraSupportStatus, stopMediaStream } from "./browser-session.ts";

test("feature detection returns unsupported when APIs are missing", () => {
  assert.equal(getCameraSupportStatus({ navigator: {} }), "unsupported");
  assert.equal(getCameraSupportStatus({ navigator: { mediaDevices: { getUserMedia: () => undefined } }, MediaRecorder: class {} }), "supported");
});

test("permission errors are classified as denied", () => {
  assert.equal(classifyCameraError(new DOMException("Permission denied", "NotAllowedError")), "denied");
  assert.equal(classifyCameraError(new DOMException("No camera", "NotFoundError")), "unsupported");
  assert.equal(classifyCameraError(new Error("unknown")), "failed");
});

test("stream cleanup stops all tracks", async () => {
  let stopped = 0;
  await stopMediaStream({
    getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }]
  } as unknown as MediaStream);
  assert.equal(stopped, 2);
});
