import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type IconName = "upload" | "studio" | "live" | "android";

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
    title: "Drill Library",
    description: "Create your own drills or start from shared ones.",
    href: "/library"
  },
  {
    icon: "upload",
    title: "Upload Video",
    description: "Analyze existing video files with browser pose processing and replay exports.",
    href: "/upload"
  },
  {
    icon: "live",
    title: "Live Streaming",
    description: "Run a browser camera session with trace retention and post-session annotated replay.",
    href: "/live"
  },
  {
    icon: "android",
    title: "Android App",
    description: "Train live on-device with the latest app release.",
    href: "https://github.com/Voycepeh/CaliVision",
    external: true
  }
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
          <h1>CaliVision</h1>
          <p className="home-subtitle">
            Build drills in Studio, analyze existing files in Upload Video, and run browser Live Streaming sessions with post-session replay exports.
            Android remains the richer native live-coaching runtime for on-device training loops.
          </p>
        </section>

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
