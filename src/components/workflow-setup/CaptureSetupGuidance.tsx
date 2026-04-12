type CaptureSetupGuidanceProps = {
  mode: "upload" | "live";
  cameraViewLabel?: string | null;
  drillTypeLabel?: "Rep" | "Hold" | null;
};

const commonTips = [
  "Keep your full body in frame from shoulders to ankles.",
  "Use the expected drill camera view for cleaner phase matching.",
  "Step back if wrists or ankles leave the frame.",
  "Better framing improves rep counts, hold timing, and phase accuracy."
];

export function CaptureSetupGuidance({ mode, cameraViewLabel, drillTypeLabel }: CaptureSetupGuidanceProps) {
  return (
    <section className="card setup-guidance-card" style={{ margin: 0 }}>
      <div style={{ display: "grid", gap: "0.3rem" }}>
        <strong>{mode === "upload" ? "Before you upload" : "Before you start live session"}</strong>
        <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
          {mode === "upload"
            ? "Choose a drill, verify framing, then upload for drill-aware replay and metrics."
            : "Choose a drill, frame your body, then start session for live drill-aware overlay feedback."}
        </p>
      </div>
      <div className="setup-guidance-meta muted">
        {cameraViewLabel ? <span>Expected view: {cameraViewLabel}</span> : <span>Expected view: Drill-dependent</span>}
        {drillTypeLabel ? <span>Movement type: {drillTypeLabel}</span> : <span>Movement type: Freestyle</span>}
      </div>
      <ul className="setup-guidance-list muted">
        {commonTips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="muted" style={{ margin: 0, fontSize: "0.79rem" }}>
        {mode === "upload"
          ? "Processing runs in your browser on this device."
          : "Live tracking runs in your browser session. Replay files stay local until you download them."}
      </p>
    </section>
  );
}
