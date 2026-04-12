import test from "node:test";
import assert from "node:assert/strict";
import { classifyUploadCompatibility } from "./compatibility.ts";

test("MP4 + H.264 is classified as supported", () => {
  const report = classifyUploadCompatibility({
    fileName: "drill.mp4",
    mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    width: 1920,
    height: 1080,
    durationMs: 5200,
    fps: 30
  });

  assert.equal(report.level, "supported");
});

test("MP4 + HEVC is classified as risky", () => {
  const report = classifyUploadCompatibility({
    fileName: "iphone.mov",
    mimeType: 'video/mp4; codecs="hvc1"',
    width: 1920,
    height: 1080,
    durationMs: 5200,
    fps: 30
  });

  assert.equal(report.level, "risky");
  assert.ok(report.reasons.some((reason) => reason.toLowerCase().includes("hevc")));
});

test("10-bit sources are classified as risky", () => {
  const report = classifyUploadCompatibility({
    fileName: "capture-10bit.mp4",
    mimeType: 'video/mp4; codecs="avc1.640028"',
    width: 1920,
    height: 1080,
    durationMs: 5200,
    fps: 30,
    bitDepth: 10
  });

  assert.equal(report.level, "risky");
  assert.ok(report.reasons.some((reason) => reason.includes("10-bit")));
});

test("120 fps sources are classified as risky", () => {
  const report = classifyUploadCompatibility({
    fileName: "slowmo.mp4",
    mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    width: 1920,
    height: 1080,
    durationMs: 5200,
    fps: 120
  });

  assert.equal(report.level, "risky");
  assert.ok(report.reasons.some((reason) => reason.toLowerCase().includes("high frame rate")));
});

test("clearly invalid non-video files are unsupported", () => {
  const report = classifyUploadCompatibility({
    fileName: "notes.txt",
    mimeType: "text/plain"
  });

  assert.equal(report.level, "unsupported");
});
