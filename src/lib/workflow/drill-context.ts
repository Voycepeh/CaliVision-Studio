export const ACTIVE_DRILL_CONTEXT_STORAGE_KEY = "workflow.active-drill";
export const ACTIVE_DRILL_CONTEXT_EVENT_NAME = "workflow:active-drill-context";

export type ActiveDrillContext = {
  drillId: string;
  sourceKind: "local" | "hosted" | "exchange";
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
    if (!parsed || (parsed.sourceKind !== "local" && parsed.sourceKind !== "hosted" && parsed.sourceKind !== "exchange")) {
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

export function readActiveDrillContext(): ActiveDrillContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  return parseActiveDrillContext(window.localStorage.getItem(ACTIVE_DRILL_CONTEXT_STORAGE_KEY));
}

export function setActiveDrillContext(context: ActiveDrillContext): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_DRILL_CONTEXT_STORAGE_KEY, serializeActiveDrillContext(context));
  window.dispatchEvent(new CustomEvent(ACTIVE_DRILL_CONTEXT_EVENT_NAME));
}

export function clearActiveDrillContext(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_DRILL_CONTEXT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ACTIVE_DRILL_CONTEXT_EVENT_NAME));
}
