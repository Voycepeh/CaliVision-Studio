import assert from "node:assert/strict";
import test from "node:test";

import { resolveResultPreviewState } from "./video-result-preview.ts";

test("processing defaults to dedicated annotated generation state", () => {
  const state = resolveResultPreviewState({
    isAnnotatedProcessing: true,
    hasAnnotatedAsset: false,
    hasRawAsset: true,
    annotatedFailed: false,
    showRawDuringProcessing: false
  });

  assert.equal(state, "processing_annotated");
});

test("show raw instead opts in to raw preview while processing", () => {
  const state = resolveResultPreviewState({
    isAnnotatedProcessing: true,
    hasAnnotatedAsset: false,
    hasRawAsset: true,
    annotatedFailed: false,
    showRawDuringProcessing: true
  });

  assert.equal(state, "showing_raw");
});

test("annotated is default once ready", () => {
  const state = resolveResultPreviewState({
    isAnnotatedProcessing: false,
    hasAnnotatedAsset: true,
    hasRawAsset: true,
    annotatedFailed: false,
    showRawDuringProcessing: false,
    completedSelection: "annotated"
  });

  assert.equal(state, "showing_annotated");
});

test("completion toggle can switch back to raw instantly", () => {
  const state = resolveResultPreviewState({
    isAnnotatedProcessing: false,
    hasAnnotatedAsset: true,
    hasRawAsset: true,
    annotatedFailed: false,
    showRawDuringProcessing: false,
    completedSelection: "raw"
  });

  assert.equal(state, "showing_raw");
});

test("annotated failure resolves to explicit raw fallback state", () => {
  const state = resolveResultPreviewState({
    isAnnotatedProcessing: false,
    hasAnnotatedAsset: false,
    hasRawAsset: true,
    annotatedFailed: true,
    showRawDuringProcessing: false
  });

  assert.equal(state, "annotated_failed");
});
