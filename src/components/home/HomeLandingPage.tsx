import Link from "next/link";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

const cards = [
  {
    icon: "⬆️",
    title: "Upload Video",
    description: "Analyze recorded attempts in your browser with local pose overlays and artifacts.",
    href: "/upload",
    cta: "Start upload"
  },
  {
    icon: "🧩",
    title: "Drill Studio",
    description: "Manage drafts and saved drills in Library before entering focused Studio editing.",
    href: "/library",
    cta: "Open Library"
  },
  {
    icon: "📱",
    title: "Android Live Coaching",
    description: "Take authored drills to on-device live coaching with the Android runtime app.",
    href: "#android-app",
    cta: "Download app"
  }
] as const;

const flowSteps = [
  "Manage drills in Library and Drill Studio",
  "Analyze recorded attempts in Upload Video",
  "Practice live with the Android app"
] as const;

export function HomeLandingPage() {
  return (
    <>
      <PrimaryNav active="home" />
      <main className="home-shell">
        <section className="home-hero">
          <p className="home-kicker">CaliVision Studio</p>
          <h1>Build better drills in the browser, then coach live on Android.</h1>
          <p className="home-subtitle">
            CaliVision Studio is the polished web workspace for drill creation, video analysis, and portable handoff into the mobile runtime
            client.
          </p>
          <div className="home-hero-actions">
            <Link href="/library" className="home-button home-button-primary">
              Open Library
            </Link>
            <Link href="/upload" className="home-button">
              Upload video
            </Link>
            <Link href="#android-app" className="home-button">
              Download Android app
            </Link>
          </div>
        </section>

        <section className="home-feature-grid" aria-label="Core entry points">
          {cards.map((card) => (
            <article key={card.title} className="home-feature-card">
              <span className="home-feature-icon" aria-hidden>
                {card.icon}
              </span>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <Link href={card.href} className="home-feature-link">
                {card.cta} →
              </Link>
            </article>
          ))}
        </section>

        <section className="home-workflow" aria-label="Workflow overview">
          <h2>One workflow across web authoring, analysis, and live coaching.</h2>
          <div className="home-workflow-steps">
            {flowSteps.map((step, index) => (
              <div key={step} className="home-workflow-step">
                <span>{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="android-app" className="home-supporting">
          <h2>Android app download</h2>
          <p>
            The live coaching runtime is available on Android. Wire this CTA to the final store URL when ready. Runtime/client repo: 
            <a href="https://github.com/Voycepeh/CaliVision" target="_blank" rel="noreferrer">
              Voycepeh/CaliVision
            </a>
            .
          </p>
          <button type="button" className="home-button" disabled>
            Store link coming soon
          </button>
        </section>
      </main>
    </>
  );
}
