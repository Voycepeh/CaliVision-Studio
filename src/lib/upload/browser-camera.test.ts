import test from "node:test";
import assert from "node:assert/strict";
import { buildBrowserRecordingFile, describeCameraFailure, detectCameraSupport, pickSupportedRecordingMimeType } from "./browser-camera.ts";

test("pickSupportedRecordingMimeType chooses first supported mime", () => {
  const mimeType = pickSupportedRecordingMimeType((candidate) => candidate === "video/webm;codecs=vp8,opus");
  assert.equal(mimeType, "video/webm;codecs=vp8,opus");
});

test("pickSupportedRecordingMimeType returns undefined when none supported", () => {
  const mimeType = pickSupportedRecordingMimeType(() => false);
  assert.equal(mimeType, undefined);
});

test("buildBrowserRecordingFile creates stable file metadata", () => {
  const now = new Date("2026-04-08T12:00:00.000Z");
  const file = buildBrowserRecordingFile(new Blob(["abc"], { type: "video/webm" }), now);

  assert.match(file.name, /^upload-camera-2026-04-08T12-00-00-000Z\.webm$/);
  assert.equal(file.type, "video/webm");
  assert.equal(file.lastModified, now.getTime());
});

test("describeCameraFailure returns permission message for denied errors", () => {
  const message = describeCameraFailure(new DOMException("denied", "NotAllowedError"));
  assert.match(message, /denied/i);
});

test("detectCameraSupport reports insecure context fallback", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalMediaRecorder = globalThis.MediaRecorder;

  Object.defineProperty(globalThis, "window", { value: { isSecureContext: false }, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "MediaRecorder", { value: class {}, configurable: true });

  assert.deepEqual(detectCameraSupport(), { supported: false, reason: "insecure-context" });

  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  Object.defineProperty(globalThis, "MediaRecorder", { value: originalMediaRecorder, configurable: true });
});
