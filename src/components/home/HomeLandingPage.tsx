import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { HomeDemoMedia } from "@/components/home/HomeDemoMedia";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type IconName = "upload" | "studio" | "live";

type HomeCard = {
  icon: IconName;
  title: string;
  description: string;
  href: string;
  external?: boolean;
};

const cards: HomeCard[] = [
  {
    icon: "studio",
    title: "Create or use a drill",
    description: "Start from your own drill or pick one from your library and Drill Exchange.",
    href: "/library"
  },
  {
    icon: "upload",
    title: "Upload Video",
    description: "Upload a clip, run drill-aware analysis, and review overlay, phases, reps, and holds.",
    href: "/upload"
  },
  {
    icon: "live",
    title: "Start live coaching",
    description: "Start a browser camera session for live overlay feedback and post-session replay review.",
    href: "/live"
  },
];

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


  if (name === "live") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M4 12a8 8 0 0 1 8-8" />
        <path d="M20 12a8 8 0 0 0-8-8" />
        <path d="M4 12a8 8 0 0 0 8 8" />
        <path d="M20 12a8 8 0 0 1-8 8" />
      </svg>
    );
  }

  return null;
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
          <h1>Drill-aware calisthenics motion analysis</h1>
          <p className="home-subtitle">
            Create drills, analyze videos, and get live overlay feedback in one browser-first workflow.
          </p>
        </section>

        <HomeDemoMedia
          title="Product demo preview"
          caption="Future demo clip should show drill selection, upload/live capture, and overlay review with rep/hold/phase-aware feedback."
          placeholderLabel="Product demo coming soon"
          steps={["Choose or author a drill", "Upload or stream", "Review overlay and metrics"]}
        />

        <section className="home-feature-grid" aria-label="Core entry points">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="home-feature-card"
              {...(card.external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span className="home-feature-icon" aria-hidden>
                <HomeIcon name={card.icon} />
              </span>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
