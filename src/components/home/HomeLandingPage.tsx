import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type IconName = "upload" | "studio" | "android";

type HomeCard = {
  icon: IconName;
  title: string;
  description: string;
  href: string;
  cta: string;
};

const cards: HomeCard[] = [
  {
    icon: "upload",
    title: "Upload Video",
    description: "Analyze recorded attempts in-browser with clear pose overlays and downloadable results.",
    href: "/upload",
    cta: "Start upload"
  },
  {
    icon: "studio",
    title: "Drill Studio",
    description: "Use Library to manage drills and versions, then jump into focused Studio editing.",
    href: "/library",
    cta: "Open Library"
  },
  {
    icon: "android",
    title: "Android Live Coaching",
    description: "Bring your drills to Android for on-device live coaching and practice sessions.",
    href: "#android-app",
    cta: "Download app"
  }
];

const flowSteps = [
  "Manage drills in Library and Drill Studio",
  "Analyze recorded attempts in Upload Video",
  "Practice live with the Android app"
] as const;

function HomeIcon({ name }: { name: IconName }) {
  if (name === "upload") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3v10" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />
      </svg>
    );
  }

  if (name === "studio") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="4" width="18" height="14" rx="3" />
        <path d="M8 20h8" />
        <path d="M10 10h4" />
        <path d="M12 8v4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <path d="M10 5h4" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  );
}

export function HomeLandingPage() {
  return (
    <>
      <PrimaryNav active="home" />
      <main className="home-shell">
        <section className="home-hero">
          <div className="home-hero-logo-wrap">
            <CaliVisionLogo size="hero" priority className="home-hero-logo" />
          </div>
          <p className="home-kicker">CaliVision Studio</p>
          <h1>Train smarter with a premium browser workspace for drills and feedback.</h1>
          <p className="home-subtitle">
            Create and refine drills in Studio, analyze video attempts in-browser, and take your training live on Android.
          </p>
          <div className="home-hero-actions">
            <Link href="/library" className="home-button home-button-primary">
              Open Library
            </Link>
            <Link href="/upload" className="home-button home-button-secondary">
              Upload video
            </Link>
            <Link href="#android-app" className="home-button home-button-tertiary">
              Download Android app
            </Link>
          </div>
        </section>

        <section className="home-feature-grid" aria-label="Core entry points">
          {cards.map((card) => (
            <article key={card.title} className="home-feature-card">
              <span className="home-feature-icon" aria-hidden>
                <HomeIcon name={card.icon} />
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
          <h2>One simple flow from planning to live coaching.</h2>
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
          <div>
            <p className="home-supporting-eyebrow">Live coaching companion</p>
            <h2>Android app</h2>
            <p>
              The Android app powers live coaching on device. Until the store listing is finalized, use the runtime repository for releases and
              updates.
            </p>
          </div>
          <div className="home-supporting-actions">
            <a href="https://github.com/Voycepeh/CaliVision" target="_blank" rel="noreferrer" className="home-button home-button-primary">
              View Android repo
            </a>
            <span className="home-coming-soon">Google Play link coming soon</span>
          </div>
        </section>
      </main>
    </>
  );
}
