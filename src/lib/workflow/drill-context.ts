export const ACTIVE_DRILL_CONTEXT_STORAGE_KEY = "workflow.active-drill";

export type ActiveDrillContext = {
  drillId: string;
  sourceKind: "local" | "hosted";
  sourceId: string;
};

export function buildWorkflowDrillKey(context: ActiveDrillContext): string {
  return `${context.sourceKind}:${context.sourceId}:${context.drillId}`;
}

export function serializeActiveDrillContext(context: ActiveDrillContext): string {
  return JSON.stringify(context);
}

export function parseActiveDrillContext(raw: string | null | undefined): ActiveDrillContext | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveDrillContext>;
    if (!parsed || (parsed.sourceKind !== "local" && parsed.sourceKind !== "hosted")) {
      return null;
    }
    if (typeof parsed.drillId !== "string" || typeof parsed.sourceId !== "string") {
      return null;
    }

    return {
      drillId: parsed.drillId,
      sourceKind: parsed.sourceKind,
      sourceId: parsed.sourceId
    };
  } catch {
    return null;
  }
}
