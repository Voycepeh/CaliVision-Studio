import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type IconName = "upload" | "studio" | "android";

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
    description: "Count reps, track holds, and review movement from your attempt.",
    href: "/upload"
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
            Build your own drills or start from shared ones. Upload a video attempt to count reps, track holds, and review movement with
            computer vision. Train live on Android with our app.
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
