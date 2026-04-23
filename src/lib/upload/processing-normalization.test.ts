import assert from "node:assert/strict";
import test from "node:test";
import {
  isSeekTimeoutDuringPoseSampling,
  shouldNormalize,
  shouldNormalizeWithCompatibility,
  validateNormalizedOutput,
  type VideoDiagnostics
} from "./processing-normalization.ts";

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

test("normalizes risky compatibility reports before analysis starts", () => {
  const file = new File(["video"], "mobile-recording.mp4", { type: 'video/mp4; codecs="avc1.42E01E"' });
  const decision = shouldNormalizeWithCompatibility(file, buildDiagnostics(), {
    level: "risky",
    reasons: ["incomplete or low-confidence metadata", "QuickTime/MOV container can include fragile metadata"]
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reasons.includes("compatibility classified as risky"), true);
  assert.equal(decision.reasons.includes("compatibility signal: incomplete or low-confidence metadata"), true);
});

test("uses unsupported compatibility wording for unsupported sources", () => {
  const file = new File(["video"], "unsupported.mkv", { type: "video/x-matroska" });
  const decision = shouldNormalizeWithCompatibility(file, buildDiagnostics(), {
    level: "unsupported",
    reasons: ["not a recognized video file"]
  });

  assert.equal(decision.required, true);
  assert.equal(decision.reasons.includes("compatibility classified as unsupported"), true);
  assert.equal(decision.reasons.includes("compatibility classified as risky"), false);
});

test("normalizes portrait uploads with ambiguous rotation metadata", () => {
  const file = new File(["video"], "portrait.mp4", { type: 'video/mp4; codecs="avc1.42E01E"' });
  const decision = shouldNormalize(
    file,
    buildDiagnostics({
      width: 1080,
      height: 1920,
      rotationMetadata: undefined
    })
  );

  assert.equal(decision.required, true);
  assert.equal(decision.reasons.includes("portrait source has ambiguous rotation metadata"), true);
});

test("classifies seek-timeout errors for single retry path", () => {
  assert.equal(isSeekTimeoutDuringPoseSampling(new Error("Video seek timed out during pose sampling.")), true);
  assert.equal(isSeekTimeoutDuringPoseSampling(new Error("Video seek timed out during pose sampling")), true);
  assert.equal(
    isSeekTimeoutDuringPoseSampling(new Error("Video seek timed out during pose sampling. target=1.23s timeout=8000ms")),
    true
  );
  assert.equal(isSeekTimeoutDuringPoseSampling("Video seek timed out during pose sampling"), true);
  assert.equal(
    isSeekTimeoutDuringPoseSampling({ message: "video seek timed out during pose sampling (wrapped)" }),
    true
  );
  assert.equal(
    isSeekTimeoutDuringPoseSampling({ cause: { message: "Video seek timed out during pose sampling." } }),
    true
  );
  assert.equal(isSeekTimeoutDuringPoseSampling(new Error("Video seek failed during pose sampling.")), false);
  assert.equal(isSeekTimeoutDuringPoseSampling({ message: "other upload error" }), false);
});

test("accepts normalized output when duration remains close to source", () => {
  const result = validateNormalizedOutput(
    { durationMs: 32_000 },
    {
      durationMs: 32_700,
      width: 1920,
      height: 1080
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.diagnostics.durationDriftMs, 700);
    assert.equal(result.diagnostics.driftCheckSkipped, false);
  }
});

test("accepts normalized output when source duration is missing but normalized metadata is valid", () => {
  const result = validateNormalizedOutput(
    { durationMs: undefined },
    {
      durationMs: 32_700,
      width: 1920,
      height: 1080
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.diagnostics.driftCheckSkipped, true);
    assert.equal(result.diagnostics.durationDriftMs, undefined);
    assert.equal(result.diagnostics.driftPct, undefined);
  }
});

test("rejects normalized output with major duration inflation", () => {
  const result = validateNormalizedOutput(
    { durationMs: 32_000 },
    {
      durationMs: 52_000,
      width: 1920,
      height: 1080
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "duration-drift");
  }
});

test("rejects normalized output missing duration metadata even when source duration is unavailable", () => {
  const result = validateNormalizedOutput(
    { durationMs: undefined },
    {
      width: 1920,
      height: 1080
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid-metadata");
  }
});

test("rejects normalized output with invalid dimensions even when source duration is unavailable", () => {
  const result = validateNormalizedOutput(
    { durationMs: undefined },
    {
      durationMs: 32_500,
      width: 0,
      height: 1080
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid-metadata");
  }
});
