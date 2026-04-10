export type EditorWorkspaceType = "cloud" | "local";

export type EditorSaveStatusState = {
  workspace: EditorWorkspaceType;
  isDirty: boolean;
  isSaving: boolean;
  hasError: boolean;
  lastSavedAtIso: string | null;
};

export type EditorSaveStatusKind = "saving" | "error" | "unsaved" | "saved";

export type EditorSaveStatus = {
  kind: EditorSaveStatusKind;
  label: string;
};

export function deriveEditorSaveStatus(state: EditorSaveStatusState): EditorSaveStatus {
  if (state.isSaving) {
    return {
      kind: "saving",
      label: "Saving..."
    };
  }

  if (state.hasError) {
    return {
      kind: "error",
      label: "Save failed / retry needed"
    };
  }

  if (state.isDirty) {
    return {
      kind: "unsaved",
      label: state.workspace === "cloud" ? "Unsaved cloud changes" : "Unsaved local changes"
    };
  }

  if (state.lastSavedAtIso) {
    return {
      kind: "saved",
      label: `${state.workspace === "cloud" ? "Saved to account" : "Saved locally"} at ${new Date(state.lastSavedAtIso).toLocaleString()}`
    };
  }

  return {
    kind: "saved",
    label: state.workspace === "cloud" ? "Saved to account" : "Saved locally"
  };
}
