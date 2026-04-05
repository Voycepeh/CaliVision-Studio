import { CANONICAL_JOINT_NAMES } from "@/lib/pose/canonical";
import type { DrillPackage, PortableAssetRef, PortablePhase } from "@/lib/schema/contracts";

const SUPPORTED_SCHEMA_VERSION = "0.1.0";

const CANONICAL_JOINT_SET = new Set<string>(CANONICAL_JOINT_NAMES);
const PORTABLE_VIEW_SET = new Set<string>(["front", "side", "rear", "three-quarter"]);

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
    | "empty";
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
    value: input as DrillPackage,
    validation
  };
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
    validateNonEmptyString(drill.slug, `${drillPath}.slug`, issues);
    validateNonEmptyString(drill.title, `${drillPath}.title`, issues);

    if (!Array.isArray(drill.tags)) {
      issues.push(makeIssue("error", `${drillPath}.tags`, "Drill tags must be an array.", "type"));
    } else if (drill.tags.length === 0) {
      issues.push(makeIssue("warning", `${drillPath}.tags`, "Drill tags are empty.", "empty"));
    }

    if (!Array.isArray(drill.phases) || drill.phases.length === 0) {
      issues.push(makeIssue("error", `${drillPath}.phases`, "Drill must include at least one phase.", "missing"));
      return;
    }

    const seenOrder = new Set<number>();

    drill.phases.forEach((phase, phaseIndex) => {
      validatePhase(phase, `${drillPath}.phases[${phaseIndex}]`, seenOrder, issues);
    });

    validatePhaseOrderingAndTitles(drill.phases, drillPath, issues);
    validateDrillTimingConsistency(drill.phases, drillPath, issues);
  });
}

function validatePhaseOrderingAndTitles(phases: unknown[], drillPath: string, issues: PackageValidationIssue[]): void {
  const parsed = phases
    .filter(isRecord)
    .filter((phase) => typeof phase.order === "number")
    .map((phase) => ({
      order: phase.order as number,
      title: typeof phase.title === "string" ? phase.title.trim() : ""
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

  const titleCounts = new Map<string, number>();
  parsed.forEach((phase) => {
    if (phase.title.length === 0) {
      return;
    }

    titleCounts.set(phase.title.toLocaleLowerCase(), (titleCounts.get(phase.title.toLocaleLowerCase()) ?? 0) + 1);
  });

  titleCounts.forEach((count, title) => {
    if (count > 1) {
      issues.push(
        makeIssue(
          "warning",
          `${drillPath}.phases`,
          `Duplicate phase title detected: '${title}'.`,
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
  validateNonEmptyString(input.title, `${path}.title`, issues);

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
        "view must be one of: front, side, rear, three-quarter.",
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

  input.forEach((asset, index) => validateAssetRef(asset, `assets[${index}]`, issues, false));
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
  return true;
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

function makeIssue(
  severity: Severity,
  path: string,
  message: string,
  code: PackageValidationIssue["code"]
): PackageValidationIssue {
  return { severity, path, message, code };
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function validateDrillTimingConsistency(
  phases: unknown[],
  drillPath: string,
  issues: PackageValidationIssue[]
): void {
  const timingCandidates = phases
    .filter(isRecord)
    .filter((phase) => typeof phase.order === "number" && typeof phase.durationMs === "number" && phase.durationMs > 0)
    .map((phase) => ({
      phaseId: typeof phase.phaseId === "string" ? phase.phaseId : "unknown-phase",
      order: phase.order as number,
      durationMs: phase.durationMs as number,
      startOffsetMs: typeof phase.startOffsetMs === "number" ? phase.startOffsetMs : undefined
    }))
    .sort((a, b) => a.order - b.order);

  let cumulativeMs = 0;

  timingCandidates.forEach((phase, index) => {
    issues.push(
      ...validatePhaseTimingConsistency(
        {
          phaseId: phase.phaseId,
          order: phase.order,
          title: "",
          durationMs: phase.durationMs,
          poseSequence: [],
          assetRefs: [],
          startOffsetMs: phase.startOffsetMs
        },
        cumulativeMs
      ).map((issue) => ({
        ...issue,
        path: `${drillPath}.phases[order=${phase.order}].startOffsetMs`
      }))
    );

    if (phase.startOffsetMs !== undefined && phase.startOffsetMs > cumulativeMs && index > 0) {
      issues.push(
        makeIssue(
          "warning",
          `${drillPath}.phases[order=${phase.order}].startOffsetMs`,
          "startOffsetMs is ahead of previous cumulative duration (gap detected).",
          "timing"
        )
      );
    }

    cumulativeMs += phase.durationMs;
  });
}

export function validatePhaseTimingConsistency(phase: PortablePhase, previousDurationTotal: number): PackageValidationIssue[] {
  const issues: PackageValidationIssue[] = [];
  if (phase.startOffsetMs !== undefined && phase.startOffsetMs < previousDurationTotal) {
    issues.push(
      makeIssue(
        "warning",
        `phase:${phase.phaseId}.startOffsetMs`,
        "startOffsetMs is behind the cumulative duration of previous phases.",
        "timing"
      )
    );
  }

  return issues;
}
