import assert from "node:assert/strict";
import test from "node:test";
import { isSeekTimeoutDuringPoseSampling, shouldNormalize, type VideoDiagnostics } from "./processing-normalization.ts";

function buildDiagnostics(overrides?: Partial<VideoDiagnostics>): VideoDiagnostics {
  return {
    width: 1920,
    height: 1080,
    durationMs: 12_000,
    codec: "avc1.42E01E",
    hasSuspiciousMetadata: false,
    ...overrides
  };
}

test("normalizes HEVC/HDR-like uploads before analysis", () => {
  const file = new File(["video"], "clip.mp4", { type: 'video/mp4; codecs="hvc1"' });
  const decision = shouldNormalize(
    file,
    buildDiagnostics({
      codec: "hvc1",
      isHdrSource: true
    })
  );

  assert.equal(decision.required, true);
  assert.equal(decision.reasons.includes("HEVC/H.265 decoder-fragile source"), true);
  assert.equal(decision.reasons.includes("HDR/HLG transfer detected or inferred"), true);
});

test("normalizes QuickTime and ambiguous mobile mp4 uploads with suspicious metadata", () => {
  const quickTimeFile = new File(["video"], "mobile-capture.MOV", { type: "video/quicktime" });
  const quickTimeDecision = shouldNormalize(
    quickTimeFile,
    buildDiagnostics({
      codec: undefined,
      hasSuspiciousMetadata: true
    })
  );
  assert.equal(quickTimeDecision.required, true);
  assert.equal(quickTimeDecision.reasons.includes("QuickTime-family upload with ambiguous diagnostics"), true);

  const genericMp4File = new File(["video"], "mobile.mp4", { type: "video/mp4" });
  const genericMp4Decision = shouldNormalize(
    genericMp4File,
    buildDiagnostics({
      codec: undefined,
      hasSuspiciousMetadata: true
    })
  );
  assert.equal(genericMp4Decision.required, true);
  assert.equal(genericMp4Decision.reasons.includes("generic mp4 upload with incomplete source diagnostics"), true);
});

test("keeps browser-friendly desktop uploads on original source", () => {
  const file = new File(["video"], "desktop-recording.mp4", { type: 'video/mp4; codecs="avc1.42E01E"' });
  const decision = shouldNormalize(file, buildDiagnostics());
  assert.equal(decision.required, false);
  assert.deepEqual(decision.reasons, []);
});

test("classifies seek-timeout errors for single retry path", () => {
  assert.equal(isSeekTimeoutDuringPoseSampling(new Error("Video seek timed out during pose sampling.")), true);
  assert.equal(isSeekTimeoutDuringPoseSampling(new Error("Video seek failed during pose sampling.")), false);
  assert.equal(isSeekTimeoutDuringPoseSampling("Video seek timed out during pose sampling."), false);
});
