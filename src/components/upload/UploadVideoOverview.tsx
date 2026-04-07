import Link from "next/link";

const steps = [
  {
    title: "1. Upload media",
    description: "Choose a local video file and set context (movement type, camera angle, notes)."
  },
  {
    title: "2. Process / analyze",
    description: "Pose extraction and motion segmentation will run in future browser/cloud processing layers."
  },
  {
    title: "3. Review generated output",
    description: "Inspect suggested phases, key poses, and confidence issues before drafting."
  },
  {
    title: "4. Convert to drill draft",
    description: "Send selected outputs to Drill Studio as a draft drill or as reference material."
  }
];

export function UploadVideoOverview() {
  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      <h2 style={{ margin: 0 }}>Upload Video workflow shell</h2>
      <p className="muted" style={{ margin: 0 }}>
        Upload Video is a first-class Studio route. It is intentionally scaffolded for the future browser-based analysis path,
        while current implementation remains local-first without heavy processing or hosted jobs.
      </p>

      <div style={{ display: "grid", gap: "0.55rem" }}>
        {steps.map((step) => (
          <article key={step.title} className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.25rem", fontSize: "0.95rem" }}>{step.title}</h3>
            <p className="muted" style={{ margin: 0 }}>{step.description}</p>
          </article>
        ))}
      </div>

      <section className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.35rem", fontSize: "0.95rem" }}>Current status and limitations</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
          <li>No real backend/auth/storage is wired yet.</li>
          <li>No full video processing pipeline is implemented in this pass.</li>
          <li>No browser live-coaching runtime is provided here.</li>
          <li>This route defines the product flow and handoff into Drill Studio.</li>
        </ul>
      </section>

      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <Link href="/studio" className="pill">Open Drill Studio</Link>
        <Link href="/library" className="pill">Back to Library home</Link>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        Mobile runtime/live coaching remains in the Android app: https://github.com/Voycepeh/CaliVision
      </p>
    </section>
  );
}
