export const DEFAULT_TRACE_STEP_MS = 1000;

export function clearFileInputValue(input: { value: string } | null | undefined): void {
  if (!input) {
    return;
  }
  input.value = "";
}

export function nextUploadWorkflowResetKey(current: number): number {
  return current + 1;
}
