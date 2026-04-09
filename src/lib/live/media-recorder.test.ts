import test from "node:test";
import assert from "node:assert/strict";
import { createMediaRecorder } from "./media-recorder.ts";

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(["x"]) });
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

test("recorder stop supports discard mode for cancel/retake", async () => {
  const original = globalThis.MediaRecorder;
  (globalThis as { MediaRecorder: typeof MediaRecorder }).MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

  const recorder = createMediaRecorder({} as MediaStream);
  const discarded = await recorder.stop({ discard: true });
  assert.equal(discarded, null);

  (globalThis as { MediaRecorder: typeof MediaRecorder | undefined }).MediaRecorder = original;
});
