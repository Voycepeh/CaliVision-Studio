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
      label: "Failed to save"
    };
  }

  if (state.isDirty) {
    return {
      kind: "unsaved",
      label: "Unsaved changes"
    };
  }

  if (state.lastSavedAtIso) {
    return {
      kind: "saved",
      label: `Saved at ${new Date(state.lastSavedAtIso).toLocaleString()}`
    };
  }

  return {
    kind: "saved",
    label: "Saved"
  };
}
