import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { HomeDemoMedia } from "@/components/home/HomeDemoMedia";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type IconName = "upload" | "studio" | "compare";

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
    title: "Drills: Studio + Library",
    description: "Create drills in Drill Studio or use existing drills from Drill Library and Drill Exchange.",
    href: "/library"
  },
  {
    icon: "upload",
    title: "Analysis: Upload + Review",
    description: "Upload a clip, run drill-aware analysis, and review key metrics, phases, reps, and holds.",
    href: "/upload"
  },
  {
    icon: "compare",
    title: "Compare: Benchmark posture",
    description: "Use benchmark-aware review to compare movement outcomes and prioritize coaching next steps.",
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


  if (name === "compare") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 7h7" />
        <path d="M4 12h10" />
        <path d="M4 17h5" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="14" cy="12" r="2" />
        <circle cx="19" cy="17" r="2" />
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
          <h1>Premium web coaching workflow for drill creation, analysis, and compare</h1>
          <p className="home-subtitle">
            CaliVision Studio unifies Drill Studio, Drill Library, Upload Analysis, Review metrics, and Benchmark Compare in one responsive web product.
          </p>
        </section>

        <HomeDemoMedia
          title="Golden workflow preview"
          caption="Future demo clip should show: Drill Library selection, Drill Studio editing, Upload Analysis review, and Benchmark Compare insights."
          placeholderLabel="Product demo coming soon"
          steps={["Create or select a drill", "Upload and analyze movement", "Review metrics and compare benchmark"]}
        />

        <section className="home-feature-grid" aria-label="Core entry points">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="home-feature-card cv-card cv-card--interactive"
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
