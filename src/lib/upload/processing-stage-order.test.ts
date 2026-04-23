import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const processingSource = readFileSync("src/lib/upload/processing.ts", "utf8");

test("normalize-first branch is resolved before analysis sampling is invoked", () => {
  const normalizeDecisionIndex = processingSource.indexOf("if (shouldRunNormalization)");
  const sampleInvocationIndex = processingSource.indexOf("deps.samplePoseTimelineFromAnalysisSource(");

  assert.notEqual(normalizeDecisionIndex, -1);
  assert.notEqual(sampleInvocationIndex, -1);
  assert.ok(
    normalizeDecisionIndex < sampleInvocationIndex,
    "normalization decision must happen before any pose analysis sampling invocation"
  );
});

test("pose model stage is initialized only in sampling path after compatibility stage", () => {
  const pipelineStart = processingSource.indexOf("export async function processVideoFileWithPipeline");
  const pipelineEnd = processingSource.indexOf("export async function processVideoFile(", pipelineStart);
  const pipelineSource = processingSource.slice(pipelineStart, pipelineEnd);
  const compatibilityStageIndex = pipelineSource.indexOf('options.onProgress?.(0.01, "Checking compatibility")');
  const sampleInvocationIndex = pipelineSource.indexOf("deps.samplePoseTimelineFromAnalysisSource(");

  assert.notEqual(pipelineStart, -1);
  assert.notEqual(pipelineEnd, -1);
  assert.notEqual(compatibilityStageIndex, -1);
  assert.notEqual(sampleInvocationIndex, -1);
  assert.ok(
    compatibilityStageIndex < sampleInvocationIndex,
    "compatibility stage must precede any sample invocation that initializes pose analysis"
  );
});
