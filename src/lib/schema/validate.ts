import { validatePortableDrillPackage } from "@/lib/package/validation/validate-package";
import type { DrillPackage, PortableDrill, PortablePhase } from "@/lib/schema/contracts";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; value: DrillPackage }
  | { ok: false; issues: ValidationIssue[] };

export function validateDrillPackage(input: unknown): ValidationResult {
  const validation = validatePortableDrillPackage(input);

  if (!validation.isValid) {
    return {
      ok: false,
      issues: validation.errors.map((issue) => ({ path: issue.path, message: issue.message }))
    };
  }

  return { ok: true, value: input as DrillPackage };
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
