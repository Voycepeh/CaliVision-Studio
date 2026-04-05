import type { DrillPackage, PortableDrill, PortablePhase, SchemaVersion } from "@/lib/schema/contracts";

const SUPPORTED_SCHEMA_VERSION: SchemaVersion = "0.1.0";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; value: DrillPackage }
  | { ok: false; issues: ValidationIssue[] };

export function validateDrillPackage(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "root", message: "Package payload must be an object." }] };
  }

  const manifest = input.manifest;
  const drills = input.drills;

  if (!isRecord(manifest)) {
    issues.push({ path: "manifest", message: "Missing manifest object." });
  } else if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    issues.push({
      path: "manifest.schemaVersion",
      message: `Unsupported schema version: ${String(manifest.schemaVersion)}.`
    });
  }

  if (!Array.isArray(drills) || drills.length === 0) {
    issues.push({ path: "drills", message: "Package must include at least one drill." });
  } else {
    drills.forEach((drill, drillIndex) => validateDrill(drill, drillIndex, issues));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: input as DrillPackage };
}

function validateDrill(input: unknown, drillIndex: number, issues: ValidationIssue[]) {
  if (!isRecord(input)) {
    issues.push({ path: `drills[${drillIndex}]`, message: "Drill must be an object." });
    return;
  }

  if (!Array.isArray(input.phases)) {
    issues.push({ path: `drills[${drillIndex}].phases`, message: "Drill must define phases array." });
    return;
  }

  const orders = new Set<number>();
  input.phases.forEach((phase, phaseIndex) => validatePhase(phase, drillIndex, phaseIndex, orders, issues));
}

function validatePhase(
  input: unknown,
  drillIndex: number,
  phaseIndex: number,
  orders: Set<number>,
  issues: ValidationIssue[]
) {
  if (!isRecord(input)) {
    issues.push({ path: `drills[${drillIndex}].phases[${phaseIndex}]`, message: "Phase must be an object." });
    return;
  }

  if (typeof input.order !== "number") {
    issues.push({
      path: `drills[${drillIndex}].phases[${phaseIndex}].order`,
      message: "Phase order must be a number."
    });
  } else if (orders.has(input.order)) {
    issues.push({
      path: `drills[${drillIndex}].phases[${phaseIndex}].order`,
      message: "Phase order values must be unique per drill."
    });
  } else {
    orders.add(input.order);
  }

  if (typeof input.durationMs !== "number" || input.durationMs <= 0) {
    issues.push({
      path: `drills[${drillIndex}].phases[${phaseIndex}].durationMs`,
      message: "Phase durationMs must be a positive number."
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateTypedDrill(drill: PortableDrill): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const orders = new Set<number>();

  drill.phases.forEach((phase, phaseIndex) => {
    validateTypedPhase(phase, phaseIndex, orders, issues);
  });

  return issues;
}

function validateTypedPhase(
  phase: PortablePhase,
  phaseIndex: number,
  orders: Set<number>,
  issues: ValidationIssue[]
): void {
  if (orders.has(phase.order)) {
    issues.push({ path: `phases[${phaseIndex}].order`, message: "Duplicate phase order found." });
  }
  orders.add(phase.order);

  if (phase.durationMs <= 0) {
    issues.push({ path: `phases[${phaseIndex}].durationMs`, message: "durationMs must be positive." });
  }
}
