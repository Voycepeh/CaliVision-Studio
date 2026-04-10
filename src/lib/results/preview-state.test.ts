import assert from "node:assert/strict";
import test from "node:test";

import { canToggleCompletedPreview, resolveAvailableDownloads, resolveUnifiedResultPreviewState } from "./preview-state.ts";

test("during processing, annotated generation state is default and raw is not shown", () => {
  const state = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: false,
    isProcessingAnnotated: true,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: false
  });

  assert.equal(state, "processing_annotated");
});

test("show raw instead switches preview during processing", () => {
  const state = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: false,
    isProcessingAnnotated: true,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: true
  });

  assert.equal(state, "showing_raw_during_processing");
});

test("completed preview defaults to annotated when ready", () => {
  const state = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: true,
    isProcessingAnnotated: false,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: false
  });

  assert.equal(state, "showing_annotated_completed");
});

test("user can toggle to raw after completion", () => {
  const state = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: true,
    isProcessingAnnotated: false,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: false,
    preferredCompletedSurface: "raw"
  });

  assert.equal(state, "showing_raw_completed");
  assert.equal(
    canToggleCompletedPreview({ hasRaw: true, hasAnnotated: true, isProcessingAnnotated: false }),
    true
  );
});

test("download actions expose both outputs when available", () => {
  assert.deepEqual(resolveAvailableDownloads({ hasRaw: true, hasAnnotated: true }), ["annotated", "raw"]);
});

test("annotated failure falls back to explicit raw state", () => {
  const state = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: false,
    isProcessingAnnotated: false,
    annotatedFailed: true,
    userRequestedRawDuringProcessing: false
  });

  assert.equal(state, "annotated_failed_showing_raw");
});

test("new run resets preview back to processing-first default", () => {
  const previouslyRaw = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: false,
    isProcessingAnnotated: true,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: true
  });
  assert.equal(previouslyRaw, "showing_raw_during_processing");

  const reset = resolveUnifiedResultPreviewState({
    hasRaw: true,
    hasAnnotated: false,
    isProcessingAnnotated: true,
    annotatedFailed: false,
    userRequestedRawDuringProcessing: false
  });

  assert.equal(reset, "processing_annotated");
});
