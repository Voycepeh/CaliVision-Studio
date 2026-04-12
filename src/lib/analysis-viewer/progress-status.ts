export type FrameProgress = {
  current: number;
  total: number;
};

export function parseFrameProgress(label: string | null | undefined): FrameProgress | null {
  if (!label) {
    return null;
  }
  const match = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return null;
  }
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return { current: Math.max(0, Math.round(current)), total: Math.max(1, Math.round(total)) };
}

export function formatAnnotatedRenderProgressLabel(input: {
  stageLabel: string | null | undefined;
  completed: boolean;
}): string | null {
  const frameProgress = parseFrameProgress(input.stageLabel);
  if (frameProgress) {
    const doneCurrent = input.completed ? frameProgress.total : Math.min(frameProgress.current, frameProgress.total);
    if (input.completed) {
      return `Annotated video ready. ${doneCurrent}/${frameProgress.total} frames`;
    }
    return `Rendering annotated video… ${doneCurrent}/${frameProgress.total} frames`;
  }

  if (!input.stageLabel) {
    return null;
  }

  if (input.completed) {
    return "Annotated video ready.";
  }
  return input.stageLabel;
}
