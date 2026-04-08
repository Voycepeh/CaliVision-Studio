import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnalysisArtifactFilename,
  createAnalysisSessionArtifact,
  deserializeAnalysisSessionArtifact,
  serializeAnalysisSessionArtifact
} from "./export-artifact.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";

function buildSession(overrides: Partial<AnalysisSessionRecord> = {}): AnalysisSessionRecord {
  return {
    sessionId: "session_123",
    drillId: "drill-alpha",
    drillTitle: "Front Lever Drill",
    drillVersion: "sample-v1",
    pipelineVersion: "drill-analysis-pipeline-v1",
    scorerVersion: "frame-phase-scorer-v1",
    sourceKind: "upload",
    sourceId: "upload-job-1",
    sourceUri: "upload://local/upload-job-1/front-lever.mp4",
    sourceLabel: "front-lever.mp4",
    status: "completed",
    createdAtIso: "2026-04-07T11:12:13.000Z",
    completedAtIso: "2026-04-07T11:12:20.000Z",
    rawVideoUri: "upload://local/upload-job-1/front-lever.mp4",
    annotatedVideoUri: "upload://local/upload-job-1/front-lever.annotated-video.webm",
    summary: {
      repCount: 3,
      analyzedDurationMs: 5400,
      holdDurationMs: 820,
      confidenceAvg: 0.82
    },
    frameSamples: [
      { timestampMs: 100, classifiedPhaseId: "bottom", confidence: 0.82 },
      { timestampMs: 0, classifiedPhaseId: "top", confidence: 0.92 }
    ],
    events: [
      { eventId: "b", timestampMs: 1200, type: "rep_complete", repIndex: 1 },
      { eventId: "a", timestampMs: 600, type: "phase_enter", phaseId: "bottom" }
    ],
    ...overrides
  };
}

test("analysis artifact export contains summary, events, and pipeline metadata", () => {
  const artifact = createAnalysisSessionArtifact(buildSession(), { exportedAt: "2026-04-08T00:00:00.000Z" });

  assert.equal(artifact.artifactType, "drill-analysis-session");
  assert.equal(artifact.artifactVersion, "1.0.0");
  assert.equal(artifact.summary.repCount, 3);
  assert.equal(artifact.events.length, 2);
  assert.equal(artifact.events[0]?.eventId, "a");
  assert.equal(artifact.frameSamples[0]?.timestampMs, 0);
  assert.equal(artifact.pipeline.pipelineVersion, "drill-analysis-pipeline-v1");
  assert.equal(artifact.pipeline.scorerVersion, "frame-phase-scorer-v1");
});

test("analysis artifact serialization/deserialization round-trip is parseable", () => {
  const serialized = serializeAnalysisSessionArtifact(buildSession(), { exportedAt: "2026-04-08T00:00:00.000Z" });
  const parsed = deserializeAnalysisSessionArtifact(serialized);

  assert.equal(parsed.session.drill.drillId, "drill-alpha");
  assert.equal(parsed.events[0]?.eventId, "a");
  assert.equal(parsed.frameSamples[0]?.timestampMs, 0);
});

test("analysis artifact export handles missing optional source and frame sample fields", () => {
  const artifact = createAnalysisSessionArtifact(
    buildSession({
      sourceUri: undefined,
      rawVideoUri: undefined,
      annotatedVideoUri: undefined,
      frameSamples: []
    }),
    { exportedAt: "2026-04-08T00:00:00.000Z" }
  );

  assert.equal(artifact.source.rawVideoUri, undefined);
  assert.equal(artifact.frameSamples.length, 0);
  assert.equal(artifact.derivedMedia?.annotatedReplay?.status, "not-generated");
});

test("analysis artifact filename is stable and meaningful", () => {
  const filename = createAnalysisArtifactFilename(buildSession());
  assert.equal(filename, "front-lever-drill.20260407_111213.session-123.analysis-artifact.json");
});

test("invalid artifact payloads are rejected", () => {
  assert.throws(() => deserializeAnalysisSessionArtifact(JSON.stringify({ artifactType: "bad", artifactVersion: "1.0.0" })));
});
