import { CANONICAL_JOINT_NAMES } from "../../pose/canonical.ts";
import { normalizeDrillBenchmark } from "../../drills/benchmark.ts";
import { normalizeDrillPhaseIdentity } from "../phase-identity.ts";
import type {
  DrillBenchmark,
  DrillPackage,
  PortableAssetRef,
  PortableDrill,
  PortableDrillAnalysis,
  PortablePhase,
} from "@/lib/schema/contracts";

const SUPPORTED_SCHEMA_VERSION = "0.1.0";

const CANONICAL_JOINT_SET = new Set<string>(CANONICAL_JOINT_NAMES);
const PORTABLE_VIEW_SET = new Set<string>(["front", "side", "rear"]);
const ASSET_TYPE_SET = new Set<string>(["image", "video", "audio", "overlay"]);
const ASSET_ROLE_SET = new Set<string>(["phase-source-image", "drill-thumbnail", "drill-preview"]);
const ANALYSIS_MEASUREMENT_SET = new Set<string>(["rep", "hold", "hybrid"]);
const PHASE_SEMANTIC_ROLE_SET = new Set<string>(["start", "bottom", "top", "lockout", "transition", "hold"]);
const BENCHMARK_SOURCE_TYPE_SET = new Set<string>([
  "none",
  "builtin",
  "seeded",
  "reference_pose_sequence",
  "reference_session",
  "reference_video"
]);

const DEFAULT_ANALYSIS_BY_MEASUREMENT: Record<"rep" | "hold" | "hybrid", PortableDrillAnalysis> = {
  rep: {
    measurementType: "rep",
    orderedPhaseSequence: [],
    criticalPhaseIds: [],
    allowedPhaseSkips: [],
    minimumConfirmationFrames: 2,
    exitGraceFrames: 2,
    minimumRepDurationMs: 300,
    cooldownMs: 150,
    entryConfirmationFrames: 2,
    minimumHoldDurationMs: 500
  },
  hold: {
    measurementType: "hold",
    orderedPhaseSequence: [],
    criticalPhaseIds: [],
    allowedPhaseSkips: [],
    minimumConfirmationFrames: 2,
    exitGraceFrames: 4,
    minimumRepDurationMs: 300,
    cooldownMs: 150,
    entryConfirmationFrames: 4,
    minimumHoldDurationMs: 1500
  },
  hybrid: {
    measurementType: "hybrid",
    orderedPhaseSequence: [],
    criticalPhaseIds: [],
    allowedPhaseSkips: [],
    minimumConfirmationFrames: 2,
    exitGraceFrames: 3,
    minimumRepDurationMs: 300,
    cooldownMs: 150,
    entryConfirmationFrames: 3,
    minimumHoldDurationMs: 1000
  }
};

type Severity = "error" | "warning";

export type PackageValidationIssue = {
  severity: Severity;
  path: string;
  message: string;
  code:
    | "type"
    | "missing"
    | "schema"
    | "phase-order"
    | "phase-required"
    | "timing"
    | "coordinates"
    | "joint"
    | "asset"
    | "empty"
    | "provenance"
    | "versioning"
    | "analysis";
};

export type PackageValidationResult = {
  isValid: boolean;
  errors: PackageValidationIssue[];
  warnings: PackageValidationIssue[];
  issues: PackageValidationIssue[];
};

export type ParsePackageResult =
  | {
      ok: true;
      parsed: unknown;
    }
  | {
      ok: false;
      error: string;
    };

export function parsePackageJson(rawText: string): ParsePackageResult {
  try {
    return { ok: true, parsed: JSON.parse(rawText) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown JSON parsing error."
    };
  }
}

export function validatePortableDrillPackage(input: unknown): PackageValidationResult {
  const issues: PackageValidationIssue[] = [];

  if (!isRecord(input)) {
    issues.push(makeIssue("error", "root", "Package payload must be a JSON object.", "type"));
    return toResult(issues);
  }

  validateManifest(input.manifest, issues);
  validateDrills(input.drills, issues);
  validateRootAssets(input.assets, issues);

  return toResult(issues);
}

export function toValidatedPackage(input: unknown):
  | {
      ok: true;
      value: DrillPackage;
      validation: PackageValidationResult;
    }
  | {
      ok: false;
      validation: PackageValidationResult;
    } {
  const validation = validatePortableDrillPackage(input);

  if (!validation.isValid) {
    return { ok: false, validation };
  }

  return {
    ok: true,
    value: normalizePortableDrillPackage(input as DrillPackage),
    validation
  };
}

export function normalizePortableDrillPackage(input: DrillPackage): DrillPackage {
  return {
    ...input,
    drills: input.drills.map((drill) => normalizePortableDrill(drill))
  };
}

export function normalizePortableDrill(drill: PortableDrill): PortableDrill {
  const sanitized = { ...(drill as PortableDrill & Record<string, unknown>) };
  delete sanitized.selectedJoint;
  delete sanitized.focusRegion;
  delete sanitized.canvasSize;
  delete sanitized.focusCanvas;

  const normalizedIdentity = normalizeDrillPhaseIdentity({
    ...sanitized,
    primaryView: drill.primaryView ?? drill.defaultView ?? "front"
  } as PortableDrill);
  const normalizedSlug = normalizeDrillSlug(normalizedIdentity);

  return {
    ...normalizedIdentity,
    slug: normalizedSlug,
    defaultView: undefined,
    analysis: normalizePortableDrillAnalysis(normalizedIdentity.analysis, normalizedIdentity.drillType),
    benchmark: normalizePortableDrillBenchmark(normalizedIdentity.benchmark, normalizedIdentity),
    phases: normalizedIdentity.phases.map((phase) => normalizePortablePhase(phase, normalizedIdentity.primaryView))
  };
}

function normalizePortableDrillBenchmark(
  benchmark: PortableDrill["benchmark"],
  drill: Pick<PortableDrill, "drillType" | "primaryView" | "phases">
): DrillBenchmark | null {
  const normalized = normalizeDrillBenchmark(benchmark);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    movementType: normalized.movementType ?? drill.drillType,
    cameraView: normalized.cameraView ?? drill.primaryView,
    phaseSequence: normalized.phaseSequence ?? [],
    timing: normalized.timing
      ? {
          ...normalized.timing,
          phaseDurationsMs: normalized.timing.phaseDurationsMs ?? {}
        }
      : undefined
  };
}

export function normalizePortablePhase(phase: PortablePhase, drillView?: PortableDrill["primaryView"]): PortablePhase {
  const sanitized = { ...(phase as PortablePhase & Record<string, unknown>) };
  delete sanitized.selectedJoint;
  delete sanitized.focusRegion;
  delete sanitized.canvasSize;
  delete sanitized.focusCanvas;
  delete sanitized.transientUi;

  return {
    ...sanitized,
    title: undefined,
    name: phase.name ?? phase.title ?? `Phase ${phase.order}`,
    poseSequence: phase.poseSequence.map((pose) => ({
      ...pose,
      canvas: {
        ...pose.canvas,
        view: drillView ?? pose.canvas.view
      }
    })),
    analysis: phase.analysis
      ? {
          ...phase.analysis,
          comparison: phase.analysis.comparison
            ? {
                ...phase.analysis.comparison,
                required: phase.analysis.comparison.required !== false,
                durationRelevant: Boolean(phase.analysis.comparison.durationRelevant),
                holdRequired: Boolean(phase.analysis.comparison.holdRequired),
                minHoldDurationMs:
                  typeof phase.analysis.comparison.minHoldDurationMs === "number" && phase.analysis.comparison.minHoldDurationMs > 0
                    ? phase.analysis.comparison.minHoldDurationMs
                    : undefined,
                targetHoldDurationMs:
                  typeof phase.analysis.comparison.targetHoldDurationMs === "number" && phase.analysis.comparison.targetHoldDurationMs > 0
                    ? phase.analysis.comparison.targetHoldDurationMs
                    : undefined,
                criteriaHooks: Array.isArray(phase.analysis.comparison.criteriaHooks)
                  ? phase.analysis.comparison.criteriaHooks.filter((hook): hook is string => typeof hook === "string" && hook.trim().length > 0)
                  : undefined
              }
            : undefined,
          matchHints: phase.analysis.matchHints
            ? {
                ...phase.analysis.matchHints,
                requiredJoints: phase.analysis.matchHints.requiredJoints ?? [],
                optionalJoints: phase.analysis.matchHints.optionalJoints ?? []
              }
            : undefined
        }
      : undefined
  } as PortablePhase;
}

export function normalizePortableDrillAnalysis(
  analysis: PortableDrillAnalysis | undefined,
  drillType: PortableDrill["drillType"]
): PortableDrillAnalysis {
  const measurementType = analysis?.measurementType ?? drillType;
  const defaults = DEFAULT_ANALYSIS_BY_MEASUREMENT[measurementType === "rep" || measurementType === "hold" ? measurementType : "hybrid"];

  return {
    ...defaults,
    ...analysis,
    measurementType,
    orderedPhaseSequence: analysis?.orderedPhaseSequence ?? [],
    criticalPhaseIds: analysis?.criticalPhaseIds ?? [],
    allowedPhaseSkips: analysis?.allowedPhaseSkips ?? []
  };
}

function normalizeDrillSlug(drill: PortableDrill): string {
  const existing = drill.slug?.trim();
  if (existing) {
    return existing;
  }

  const seed = drill.drillId?.trim() || drill.title?.trim() || "drill";
  const normalized = seed
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "drill";
}

function validateManifest(input: unknown, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", "manifest", "Manifest object is required.", "missing"));
    return;
  }

  validateNonEmptyString(input.schemaVersion, "manifest.schemaVersion", issues);
  if (typeof input.schemaVersion === "string" && input.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    issues.push(
      makeIssue(
        "error",
        "manifest.schemaVersion",
        `Unsupported schemaVersion '${input.schemaVersion}'. Expected '${SUPPORTED_SCHEMA_VERSION}'.`,
        "schema"
      )
    );
  }

  validateNonEmptyString(input.packageId, "manifest.packageId", issues);
  validateNonEmptyString(input.packageVersion, "manifest.packageVersion", issues);
  validateNonEmptyString(input.createdAtIso, "manifest.createdAtIso", issues);
  validateNonEmptyString(input.updatedAtIso, "manifest.updatedAtIso", issues);
  validateNonEmptyString(input.source, "manifest.source", issues);

  if (input.publishing !== undefined) {
    validatePublishingMetadata(input.publishing, "manifest.publishing", issues);
  }

  if (input.versioning !== undefined) {
    validateVersioningMetadata(input.versioning, input.packageId, input.packageVersion, "manifest.versioning", issues);
  }

  if (!isRecord(input.compatibility)) {
    issues.push(makeIssue("error", "manifest.compatibility", "Compatibility object is required.", "missing"));
    return;
  }

  validateNonEmptyString(input.compatibility.androidMinVersion, "manifest.compatibility.androidMinVersion", issues);
  validateNonEmptyString(
    input.compatibility.androidTargetContract,
    "manifest.compatibility.androidTargetContract",
    issues
  );
}

function validateVersioningMetadata(
  input: unknown,
  packageId: unknown,
  packageVersion: unknown,
  path: string,
  issues: PackageValidationIssue[]
): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "Versioning metadata must be an object when present.", "versioning"));
    return;
  }

  validateNonEmptyString(input.packageSlug, `${path}.packageSlug`, issues);
  validateNonEmptyString(input.versionId, `${path}.versionId`, issues);

  if (typeof input.revision !== "number" || input.revision < 1) {
    issues.push(makeIssue("error", `${path}.revision`, "revision must be a positive integer.", "versioning"));
  }

  validateNonEmptyString(input.lineageId, `${path}.lineageId`, issues);

  if (input.draftStatus !== undefined && !["draft", "publish-ready"].includes(String(input.draftStatus))) {
    issues.push(makeIssue("error", `${path}.draftStatus`, "draftStatus must be draft or publish-ready.", "versioning"));
  }

  if (
    typeof input.versionId === "string" &&
    typeof packageId === "string" &&
    typeof packageVersion === "string" &&
    input.versionId !== `${packageId}@${packageVersion}`
  ) {
    issues.push(
      makeIssue(
        "warning",
        `${path}.versionId`,
        "versionId should match manifest.packageId@manifest.packageVersion.",
        "versioning"
      )
    );
  }

  if (input.derivedFrom !== undefined) {
    validateProvenanceMetadata(input.derivedFrom, `${path}.derivedFrom`, issues);
  }
}

function validateProvenanceMetadata(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "derivedFrom must be an object.", "provenance"));
    return;
  }

  if (!["fork", "remix", "duplicate", "new-version", "import"].includes(String(input.relation))) {
    issues.push(makeIssue("error", `${path}.relation`, "relation must be fork, remix, duplicate, new-version, or import.", "provenance"));
  }

  validateNonEmptyString(input.parentPackageId, `${path}.parentPackageId`, issues);
  validateOptionalNonEmptyString(input.parentVersionId, `${path}.parentVersionId`, issues);
  validateOptionalNonEmptyString(input.parentEntryId, `${path}.parentEntryId`, issues);
  validateOptionalNonEmptyString(input.note, `${path}.note`, issues);
}

function validatePublishingMetadata(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "Publishing metadata must be an object when present.", "type"));
    return;
  }

  validateOptionalNonEmptyString(input.title, `${path}.title`, issues);
  validateOptionalNonEmptyString(input.summary, `${path}.summary`, issues);
  validateOptionalNonEmptyString(input.description, `${path}.description`, issues);
  validateOptionalNonEmptyString(input.authorDisplayName, `${path}.authorDisplayName`, issues);

  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    issues.push(makeIssue("error", `${path}.tags`, "Publishing tags must be an array.", "type"));
  }

  if (input.categories !== undefined && !Array.isArray(input.categories)) {
    issues.push(makeIssue("error", `${path}.categories`, "Publishing categories must be an array.", "type"));
  }

  if (input.visibility !== undefined && !["private", "unlisted", "public"].includes(String(input.visibility))) {
    issues.push(makeIssue("error", `${path}.visibility`, "visibility must be private, unlisted, or public.", "type"));
  }

  if (input.publishStatus !== undefined && !["draft", "published"].includes(String(input.publishStatus))) {
    issues.push(makeIssue("error", `${path}.publishStatus`, "publishStatus must be draft or published.", "type"));
  }

  validateOptionalNonEmptyString(input.latestArtifactChecksumSha256, `${path}.latestArtifactChecksumSha256`, issues);
  validateOptionalNonEmptyString(input.lastPreparedAtIso, `${path}.lastPreparedAtIso`, issues);
}

function validateDrills(input: unknown, issues: PackageValidationIssue[]): void {
  if (!Array.isArray(input) || input.length === 0) {
    issues.push(makeIssue("error", "drills", "At least one drill is required.", "missing"));
    return;
  }

  input.forEach((drill, drillIndex) => {
    const drillPath = `drills[${drillIndex}]`;

    if (!isRecord(drill)) {
      issues.push(makeIssue("error", drillPath, "Drill must be an object.", "type"));
      return;
    }

    validateNonEmptyString(drill.drillId, `${drillPath}.drillId`, issues);
    validateOptionalNonEmptyString(drill.slug, `${drillPath}.slug`, issues);
    validateNonEmptyString(drill.title, `${drillPath}.title`, issues);
    const drillView = typeof drill.primaryView === "string" ? drill.primaryView : drill.defaultView;
    if (typeof drillView !== "string" || !PORTABLE_VIEW_SET.has(drillView)) {
      issues.push(makeIssue("error", `${drillPath}.primaryView`, "primaryView must be front, side, or rear.", "type"));
    }
    if (!["hold", "rep"].includes(String(drill.drillType))) {
      issues.push(makeIssue("error", `${drillPath}.drillType`, "drillType must be hold or rep.", "type"));
    }

    if (drill.thumbnailAssetId !== undefined) {
      validateNonEmptyString(drill.thumbnailAssetId, `${drillPath}.thumbnailAssetId`, issues);
    }

    if (drill.previewAssetId !== undefined) {
      validateNonEmptyString(drill.previewAssetId, `${drillPath}.previewAssetId`, issues);
    }

    if (!Array.isArray(drill.tags)) {
      issues.push(makeIssue("error", `${drillPath}.tags`, "Drill tags must be an array.", "type"));
    } else if (drill.tags.length === 0) {
      issues.push(makeIssue("warning", `${drillPath}.tags`, "Drill tags are empty.", "empty"));
    }

    if (!Array.isArray(drill.phases) || drill.phases.length === 0) {
      issues.push(makeIssue("error", `${drillPath}.phases`, "Drill must include at least one phase.", "missing"));
      return;
    }

    if (drill.analysis !== undefined) {
      validateDrillAnalysis(drill.analysis, drill.phases, drill.drillType, `${drillPath}.analysis`, issues);
    }
    if (drill.benchmark !== undefined && drill.benchmark !== null) {
      validateDrillBenchmark(drill.benchmark, drill.phases, `${drillPath}.benchmark`, issues);
    }

    const seenOrder = new Set<number>();

    drill.phases.forEach((phase, phaseIndex) => {
      validatePhase(phase, `${drillPath}.phases[${phaseIndex}]`, seenOrder, issues);
    });

    validatePhaseOrderingAndNames(drill.phases, drillPath, issues);
    validateDrillTimingConsistency(drill.phases, drillPath, issues);
  });
}

function validateDrillBenchmark(input: unknown, phases: unknown[], path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "benchmark must be an object when present.", "type"));
    return;
  }

  if (typeof input.sourceType !== "string" || !BENCHMARK_SOURCE_TYPE_SET.has(input.sourceType)) {
    issues.push(
      makeIssue(
        "error",
        `${path}.sourceType`,
        "sourceType must be none, builtin, seeded, reference_pose_sequence, reference_session, or reference_video.",
        "type"
      )
    );
  }

  if (input.movementType !== undefined && !["rep", "hold"].includes(String(input.movementType))) {
    issues.push(makeIssue("error", `${path}.movementType`, "movementType must be rep or hold when present.", "type"));
  }

  if (input.cameraView !== undefined && !PORTABLE_VIEW_SET.has(String(input.cameraView))) {
    issues.push(makeIssue("error", `${path}.cameraView`, "cameraView must be front, side, or rear when present.", "type"));
  }

  if (input.phaseSequence !== undefined) {
    if (!Array.isArray(input.phaseSequence)) {
      issues.push(makeIssue("error", `${path}.phaseSequence`, "phaseSequence must be an array when present.", "type"));
    } else {
      const phaseIds = new Set(
        phases
          .filter(isRecord)
          .map((phase) => (typeof phase.phaseId === "string" ? phase.phaseId : ""))
          .filter(Boolean)
      );
      const seenKeys = new Set<string>();

      input.phaseSequence.forEach((phase, index) => {
        const phasePath = `${path}.phaseSequence[${index}]`;
        if (!isRecord(phase)) {
          issues.push(makeIssue("error", phasePath, "benchmark phase must be an object.", "type"));
          return;
        }

        validateNonEmptyString(phase.key, `${phasePath}.key`, issues);
        if (typeof phase.key === "string") {
          const normalizedKey = phase.key.trim().toLocaleLowerCase();
          if (seenKeys.has(normalizedKey)) {
            issues.push(makeIssue("warning", `${phasePath}.key`, "benchmark phase keys should be unique.", "phase-required"));
          }
          seenKeys.add(normalizedKey);
        }
        validateOptionalNonEmptyString(phase.label, `${phasePath}.label`, issues);
        if (typeof phase.order !== "number" || phase.order <= 0) {
          issues.push(makeIssue("error", `${phasePath}.order`, "benchmark phase order must be a positive number.", "type"));
        }
        if (phase.targetDurationMs !== undefined && (typeof phase.targetDurationMs !== "number" || phase.targetDurationMs <= 0)) {
          issues.push(makeIssue("error", `${phasePath}.targetDurationMs`, "targetDurationMs must be a positive number when present.", "timing"));
        }

        if (typeof phase.key === "string" && phaseIds.size > 0 && !phaseIds.has(phase.key) && phase.key.startsWith("phase_")) {
          issues.push(makeIssue("warning", `${phasePath}.key`, `benchmark phase key '${phase.key}' does not match authored phaseId.`, "phase-required"));
        }
      });
    }
  }
}

function validateDrillAnalysis(
  input: unknown,
  phases: unknown[],
  drillType: unknown,
  path: string,
  issues: PackageValidationIssue[]
): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "analysis must be an object when present.", "analysis"));
    return;
  }

  if (typeof input.measurementType !== "string" || !ANALYSIS_MEASUREMENT_SET.has(input.measurementType)) {
    issues.push(makeIssue("error", `${path}.measurementType`, "measurementType must be rep, hold, or hybrid.", "analysis"));
  }

  const phaseIds = new Set(
    phases.filter(isRecord).map((phase) => (typeof phase.phaseId === "string" ? phase.phaseId : "")).filter(Boolean)
  );

  validateStringArray(input.orderedPhaseSequence, `${path}.orderedPhaseSequence`, true, issues, "analysis");
  validateStringArray(input.criticalPhaseIds, `${path}.criticalPhaseIds`, true, issues, "analysis");

  if (Array.isArray(input.orderedPhaseSequence)) {
    input.orderedPhaseSequence.forEach((phaseId, index) => {
      if (typeof phaseId === "string" && !phaseIds.has(phaseId)) {
        issues.push(makeIssue("error", `${path}.orderedPhaseSequence[${index}]`, `Unknown phaseId '${phaseId}' in orderedPhaseSequence.`, "analysis"));
      }
    });
  }

  if (Array.isArray(input.criticalPhaseIds)) {
    input.criticalPhaseIds.forEach((phaseId, index) => {
      if (typeof phaseId === "string" && !phaseIds.has(phaseId)) {
        issues.push(makeIssue("error", `${path}.criticalPhaseIds[${index}]`, `Unknown phaseId '${phaseId}' in criticalPhaseIds.`, "analysis"));
      }
    });
  }

  if (!Array.isArray(input.allowedPhaseSkips)) {
    issues.push(makeIssue("error", `${path}.allowedPhaseSkips`, "allowedPhaseSkips must be an array of bounded skip transition objects.", "analysis"));
  } else {
    input.allowedPhaseSkips.forEach((skipTransition, transitionIndex) => {
      if (!isRecord(skipTransition)) {
        issues.push(makeIssue("error", `${path}.allowedPhaseSkips[${transitionIndex}]`, "Each allowed skip transition must be an object.", "analysis"));
        return;
      }

      validateNonEmptyString(skipTransition.fromPhaseId, `${path}.allowedPhaseSkips[${transitionIndex}].fromPhaseId`, issues);
      validateNonEmptyString(skipTransition.toPhaseId, `${path}.allowedPhaseSkips[${transitionIndex}].toPhaseId`, issues);
      validateStringArray(
        skipTransition.skippedPhaseIds,
        `${path}.allowedPhaseSkips[${transitionIndex}].skippedPhaseIds`,
        true,
        issues,
        "analysis"
      );

      if (typeof skipTransition.fromPhaseId === "string" && !phaseIds.has(skipTransition.fromPhaseId)) {
        issues.push(makeIssue("error", `${path}.allowedPhaseSkips[${transitionIndex}].fromPhaseId`, `Unknown phaseId '${skipTransition.fromPhaseId}' in allowedPhaseSkips transition.`, "analysis"));
      }

      if (typeof skipTransition.toPhaseId === "string" && !phaseIds.has(skipTransition.toPhaseId)) {
        issues.push(makeIssue("error", `${path}.allowedPhaseSkips[${transitionIndex}].toPhaseId`, `Unknown phaseId '${skipTransition.toPhaseId}' in allowedPhaseSkips transition.`, "analysis"));
      }

      if (Array.isArray(skipTransition.skippedPhaseIds)) {
        skipTransition.skippedPhaseIds.forEach((phaseId, phaseIndex) => {
          if (typeof phaseId === "string" && !phaseIds.has(phaseId)) {
            issues.push(makeIssue("error", `${path}.allowedPhaseSkips[${transitionIndex}].skippedPhaseIds[${phaseIndex}]`, `Unknown phaseId '${phaseId}' in allowedPhaseSkips transition.`, "analysis"));
          }
        });
      }
    });
  }

  validatePositiveNumber(input.minimumConfirmationFrames, `${path}.minimumConfirmationFrames`, issues, "analysis");
  validateNonNegativeNumber(input.exitGraceFrames, `${path}.exitGraceFrames`, issues, "analysis");
  validatePositiveNumber(input.minimumRepDurationMs, `${path}.minimumRepDurationMs`, issues, "analysis");
  validateNonNegativeNumber(input.cooldownMs, `${path}.cooldownMs`, issues, "analysis");
  validatePositiveNumber(input.entryConfirmationFrames, `${path}.entryConfirmationFrames`, issues, "analysis");
  validatePositiveNumber(input.minimumHoldDurationMs, `${path}.minimumHoldDurationMs`, issues, "analysis");

  if (input.maximumRepDurationMs !== undefined) {
    validatePositiveNumber(input.maximumRepDurationMs, `${path}.maximumRepDurationMs`, issues, "analysis");
    if (typeof input.minimumRepDurationMs === "number" && typeof input.maximumRepDurationMs === "number" && input.maximumRepDurationMs < input.minimumRepDurationMs) {
      issues.push(makeIssue("error", `${path}.maximumRepDurationMs`, "maximumRepDurationMs must be >= minimumRepDurationMs.", "analysis"));
    }
  }

  if (input.targetHoldPhaseId !== undefined) {
    validateNonEmptyString(input.targetHoldPhaseId, `${path}.targetHoldPhaseId`, issues);
    if (typeof input.targetHoldPhaseId === "string" && !phaseIds.has(input.targetHoldPhaseId)) {
      issues.push(makeIssue("error", `${path}.targetHoldPhaseId`, `Unknown hold phaseId '${input.targetHoldPhaseId}'.`, "analysis"));
    }
  }

  if (input.measurementType === "hold" && input.targetHoldPhaseId === undefined) {
    issues.push(makeIssue("warning", `${path}.targetHoldPhaseId`, "Hold drills should define targetHoldPhaseId for stable hold detection.", "analysis"));
  }

  if (input.measurementType === "rep" && drillType === "hold") {
    issues.push(makeIssue("warning", `${path}.measurementType`, "measurementType 'rep' differs from drillType 'hold'.", "analysis"));
  }
}

function validatePhaseOrderingAndNames(phases: unknown[], drillPath: string, issues: PackageValidationIssue[]): void {
  const parsed = phases
    .filter(isRecord)
    .filter((phase) => typeof phase.order === "number")
    .map((phase) => ({
      order: phase.order as number,
      name: typeof phase.name === "string" ? phase.name.trim() : typeof phase.title === "string" ? phase.title.trim() : ""
    }))
    .sort((a, b) => a.order - b.order);

  parsed.forEach((phase, index) => {
    const expectedOrder = index + 1;
    if (phase.order !== expectedOrder) {
      issues.push(
        makeIssue(
          "warning",
          `${drillPath}.phases[order=${phase.order}].order`,
          `Phase order sequence is non-contiguous. Expected ${expectedOrder}.`,
          "phase-order"
        )
      );
    }
  });

  const nameCounts = new Map<string, number>();
  parsed.forEach((phase) => {
    if (phase.name.length === 0) {
      return;
    }

    nameCounts.set(phase.name.toLocaleLowerCase(), (nameCounts.get(phase.name.toLocaleLowerCase()) ?? 0) + 1);
  });

  nameCounts.forEach((count, name) => {
    if (count > 1) {
      issues.push(
        makeIssue(
          "warning",
          `${drillPath}.phases`,
          `Duplicate phase name detected: '${name}'.`,
          "phase-required"
        )
      );
    }
  });
}

function validatePhase(
  input: unknown,
  path: string,
  seenOrder: Set<number>,
  issues: PackageValidationIssue[]
): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "Phase must be an object.", "type"));
    return;
  }

  validateNonEmptyString(input.phaseId, `${path}.phaseId`, issues);
  const phaseName = typeof input.name === "string" ? input.name : input.title;
  validateNonEmptyString(phaseName, `${path}.name`, issues);

  if (typeof input.order !== "number" || !Number.isFinite(input.order)) {
    issues.push(makeIssue("error", `${path}.order`, "Phase order must be a finite number.", "type"));
  } else if (seenOrder.has(input.order)) {
    issues.push(makeIssue("error", `${path}.order`, "Phase order must be unique within a drill.", "phase-order"));
  } else {
    seenOrder.add(input.order);
  }

  if (typeof input.durationMs !== "number" || input.durationMs <= 0) {
    issues.push(makeIssue("error", `${path}.durationMs`, "durationMs must be a positive number.", "timing"));
  }

  if (input.startOffsetMs !== undefined && (typeof input.startOffsetMs !== "number" || input.startOffsetMs < 0)) {
    issues.push(makeIssue("error", `${path}.startOffsetMs`, "startOffsetMs must be >= 0 when present.", "timing"));
  }

  if (input.analysis !== undefined) {
    validatePhaseAnalysis(input.analysis, `${path}.analysis`, issues);
  }

  if (!Array.isArray(input.poseSequence)) {
    issues.push(makeIssue("error", `${path}.poseSequence`, "poseSequence must be an array.", "type"));
  } else {
    input.poseSequence.forEach((pose, poseIndex) => validatePose(pose, `${path}.poseSequence[${poseIndex}]`, issues));
  }

  if (!Array.isArray(input.assetRefs)) {
    issues.push(makeIssue("error", `${path}.assetRefs`, "assetRefs must be an array.", "asset"));
  } else {
    input.assetRefs.forEach((asset, assetIndex) =>
      validateAssetRef(asset, `${path}.assetRefs[${assetIndex}]`, issues, true)
    );
  }
}

function validatePhaseAnalysis(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "phase analysis metadata must be an object.", "analysis"));
    return;
  }

  if (input.semanticRole !== undefined) {
    if (typeof input.semanticRole !== "string" || !PHASE_SEMANTIC_ROLE_SET.has(input.semanticRole)) {
      issues.push(makeIssue("error", `${path}.semanticRole`, "semanticRole must be start, bottom, top, lockout, transition, or hold.", "analysis"));
    }
  }

  if (input.isCritical !== undefined && typeof input.isCritical !== "boolean") {
    issues.push(makeIssue("error", `${path}.isCritical`, "isCritical must be a boolean when present.", "analysis"));
  }

  if (input.matchHints !== undefined) {
    validatePhaseMatchHints(input.matchHints, `${path}.matchHints`, issues);
  }
}

function validatePhaseMatchHints(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "matchHints must be an object when present.", "analysis"));
    return;
  }

  validateJointNameArray(input.requiredJoints, `${path}.requiredJoints`, issues);
  validateJointNameArray(input.optionalJoints, `${path}.optionalJoints`, issues);

  if (input.toleranceProfile !== undefined && typeof input.toleranceProfile !== "string") {
    issues.push(makeIssue("error", `${path}.toleranceProfile`, "toleranceProfile must be a string when present.", "analysis"));
  }

  if (input.viewHint !== undefined && typeof input.viewHint !== "string") {
    issues.push(makeIssue("error", `${path}.viewHint`, "viewHint must be a string when present.", "analysis"));
  }
}

function validateJointNameArray(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (input === undefined) {
    return;
  }

  if (!Array.isArray(input)) {
    issues.push(makeIssue("error", path, "Expected an array of canonical joint names.", "analysis"));
    return;
  }

  input.forEach((jointName, index) => {
    if (typeof jointName !== "string" || !CANONICAL_JOINT_SET.has(jointName)) {
      issues.push(makeIssue("error", `${path}[${index}]`, `Unknown canonical joint '${String(jointName)}'.`, "analysis"));
    }
  });
}

function validatePose(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "Pose entry must be an object.", "type"));
    return;
  }

  validateNonEmptyString(input.poseId, `${path}.poseId`, issues);

  if (typeof input.timestampMs !== "number" || input.timestampMs < 0) {
    issues.push(makeIssue("error", `${path}.timestampMs`, "timestampMs must be >= 0.", "timing"));
  }

  if (!isRecord(input.canvas)) {
    issues.push(makeIssue("error", `${path}.canvas`, "canvas object is required.", "missing"));
  } else {
    validateCanvas(input.canvas, `${path}.canvas`, issues);
  }

  if (!isRecord(input.joints)) {
    issues.push(makeIssue("error", `${path}.joints`, "joints must be an object keyed by canonical names.", "type"));
    return;
  }

  Object.entries(input.joints).forEach(([jointName, jointValue]) => {
    const jointPath = `${path}.joints.${jointName}`;

    if (!CANONICAL_JOINT_SET.has(jointName)) {
      issues.push(makeIssue("error", jointPath, `Unknown canonical joint '${jointName}'.`, "joint"));
      return;
    }

    if (!isRecord(jointValue)) {
      issues.push(makeIssue("error", jointPath, "Joint value must be an object.", "type"));
      return;
    }

    validateNormalizedCoordinate(jointValue.x, `${jointPath}.x`, issues);
    validateNormalizedCoordinate(jointValue.y, `${jointPath}.y`, issues);
  });
}

function validateCanvas(input: Record<string, unknown>, path: string, issues: PackageValidationIssue[]): void {
  if (input.coordinateSystem !== "normalized-2d") {
    issues.push(
      makeIssue(
        "error",
        `${path}.coordinateSystem`,
        "coordinateSystem must be 'normalized-2d' for portable compatibility.",
        "coordinates"
      )
    );
  }

  if (typeof input.widthRef !== "number" || input.widthRef <= 0) {
    issues.push(makeIssue("error", `${path}.widthRef`, "widthRef must be a positive number.", "coordinates"));
  }

  if (typeof input.heightRef !== "number" || input.heightRef <= 0) {
    issues.push(makeIssue("error", `${path}.heightRef`, "heightRef must be a positive number.", "coordinates"));
  }

  if (typeof input.view !== "string" || !PORTABLE_VIEW_SET.has(input.view)) {
    issues.push(
      makeIssue(
        "error",
        `${path}.view`,
        "view must be one of: front, side, rear.",
        "type"
      )
    );
  }
}

function validateNormalizedCoordinate(
  input: unknown,
  path: string,
  issues: PackageValidationIssue[]
): void {
  if (typeof input !== "number" || Number.isNaN(input)) {
    issues.push(makeIssue("error", path, "Coordinate must be a number.", "coordinates"));
    return;
  }

  if (input < 0 || input > 1) {
    issues.push(makeIssue("error", path, "Coordinate must be normalized in the range [0, 1].", "coordinates"));
  }
}

function validateRootAssets(input: unknown, issues: PackageValidationIssue[]): void {
  if (input === undefined) {
    return;
  }

  if (!Array.isArray(input)) {
    issues.push(makeIssue("error", "assets", "assets must be an array when provided.", "asset"));
    return;
  }

  const seenAssetIds = new Set<string>();
  const seenAssetUris = new Set<string>();

  input.forEach((asset, index) => {
    const path = `assets[${index}]`;

    if (!validateAssetRef(asset, path, issues, false)) {
      return;
    }

    if (seenAssetIds.has(asset.assetId)) {
      issues.push(makeIssue("error", `${path}.assetId`, `Duplicate assetId '${asset.assetId}' found in root assets.`, "asset"));
    }
    seenAssetIds.add(asset.assetId);

    if (seenAssetUris.has(asset.uri)) {
      issues.push(makeIssue("error", `${path}.uri`, `Duplicate asset uri '${asset.uri}' found in root assets.`, "asset"));
    }
    seenAssetUris.add(asset.uri);
  });
}

function validateAssetRef(
  input: unknown,
  path: string,
  issues: PackageValidationIssue[],
  enforceNonEmpty: boolean
): input is PortableAssetRef {
  if (!isRecord(input)) {
    issues.push(makeIssue("error", path, "Asset ref must be an object.", "asset"));
    return false;
  }

  validateNonEmptyString(input.assetId, `${path}.assetId`, issues, enforceNonEmpty);
  validateNonEmptyString(input.type, `${path}.type`, issues, enforceNonEmpty);
  validateNonEmptyString(input.uri, `${path}.uri`, issues, enforceNonEmpty);

  if (typeof input.type === "string" && !ASSET_TYPE_SET.has(input.type)) {
    issues.push(makeIssue("error", `${path}.type`, `Unsupported asset type '${input.type}'.`, "asset"));
  }

  if (input.role !== undefined) {
    validateNonEmptyString(input.role, `${path}.role`, issues, enforceNonEmpty);

    if (typeof input.role === "string" && !ASSET_ROLE_SET.has(input.role)) {
      issues.push(makeIssue("error", `${path}.role`, `Unsupported asset role '${input.role}'.`, "asset"));
    }
  }

  if (input.ownerDrillId !== undefined) {
    validateNonEmptyString(input.ownerDrillId, `${path}.ownerDrillId`, issues, enforceNonEmpty);
  }

  if (input.ownerPhaseId !== undefined) {
    validateNonEmptyString(input.ownerPhaseId, `${path}.ownerPhaseId`, issues, enforceNonEmpty);
  }

  return true;
}

function validateOptionalNonEmptyString(input: unknown, path: string, issues: PackageValidationIssue[]): void {
  if (input === undefined) {
    return;
  }

  validateNonEmptyString(input, path, issues);
}

function validateNonEmptyString(
  input: unknown,
  path: string,
  issues: PackageValidationIssue[],
  enforce = true
): void {
  if (typeof input !== "string") {
    issues.push(makeIssue("error", path, "Expected a string value.", "type"));
    return;
  }

  if (enforce && input.trim().length === 0) {
    issues.push(makeIssue("error", path, "Value must not be empty.", "empty"));
  }
}

function validateStringArray(
  input: unknown,
  path: string,
  required: boolean,
  issues: PackageValidationIssue[],
  code: PackageValidationIssue["code"]
): void {
  if (input === undefined && !required) {
    return;
  }

  if (!Array.isArray(input)) {
    issues.push(makeIssue("error", path, "Expected an array of strings.", code));
    return;
  }

  input.forEach((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(makeIssue("error", `${path}[${index}]`, "Expected a non-empty string.", code));
    }
  });
}

function validatePositiveNumber(
  input: unknown,
  path: string,
  issues: PackageValidationIssue[],
  code: PackageValidationIssue["code"]
): void {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    issues.push(makeIssue("error", path, "Expected a positive number.", code));
  }
}

function validateNonNegativeNumber(
  input: unknown,
  path: string,
  issues: PackageValidationIssue[],
  code: PackageValidationIssue["code"]
): void {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    issues.push(makeIssue("error", path, "Expected a non-negative number.", code));
  }
}


export function validatePhaseTimingConsistency(phases: PortablePhase[]): PackageValidationIssue[] {
  const issues: PackageValidationIssue[] = [];
  validateDrillTimingConsistency(phases, "drill", issues);
  return issues;
}

function validateDrillTimingConsistency(phases: unknown[], drillPath: string, issues: PackageValidationIssue[]): void {
  const parsedPhases = phases
    .map((phase, index) => {
      if (!isRecord(phase)) {
        return null;
      }

      return {
        index,
        order: typeof phase.order === "number" ? phase.order : Number.NaN,
        durationMs: typeof phase.durationMs === "number" ? phase.durationMs : Number.NaN,
        startOffsetMs: typeof phase.startOffsetMs === "number" ? phase.startOffsetMs : null,
        name: typeof phase.name === "string" ? phase.name : typeof phase.title === "string" ? phase.title : ""
      };
    })
    .filter((phase): phase is NonNullable<typeof phase> => phase !== null)
    .sort((a, b) => a.order - b.order);

  let rollingStart = 0;

  parsedPhases.forEach((phase, sortedIndex) => {
    if (!Number.isFinite(phase.durationMs) || phase.durationMs <= 0) {
      return;
    }

    if (phase.startOffsetMs === null) {
      rollingStart += phase.durationMs;
      return;
    }

    if (phase.startOffsetMs < rollingStart) {
      issues.push(
        makeIssue(
          "warning",
          `${drillPath}.phases[${phase.index}].startOffsetMs`,
          `Phase '${phase.name || phase.order}' starts before the previous phase window completes.`,
          "timing"
        )
      );
    }

    if (sortedIndex > 0) {
      const previous = parsedPhases[sortedIndex - 1];
      const expected = (previous.startOffsetMs ?? rollingStart - previous.durationMs) + previous.durationMs;

      if (phase.startOffsetMs > expected + 1000) {
        issues.push(
          makeIssue(
            "warning",
            `${drillPath}.phases[${phase.index}].startOffsetMs`,
            `Gap detected before phase '${phase.name || phase.order}' (${phase.startOffsetMs - expected}ms).`,
            "timing"
          )
        );
      }
    }

    rollingStart = Math.max(rollingStart, phase.startOffsetMs + phase.durationMs);
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function makeIssue(
  severity: Severity,
  path: string,
  message: string,
  code: PackageValidationIssue["code"]
): PackageValidationIssue {
  return {
    severity,
    path,
    message,
    code
  };
}

function toResult(issues: PackageValidationIssue[]): PackageValidationResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    issues
  };
}
