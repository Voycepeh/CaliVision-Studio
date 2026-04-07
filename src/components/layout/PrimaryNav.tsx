import Link from "next/link";

type PrimaryNavProps = {
  active?: "home" | "library" | "studio" | "upload" | "exchange";
};

const items = [
  { href: "/", label: "Home", key: "home" },
  { href: "/library", label: "Library", key: "library" },
  { href: "/studio", label: "Studio", key: "studio" },
  { href: "/upload", label: "Upload Video", key: "upload" },
  { href: "/marketplace", label: "Exchange", key: "exchange" }
] as const;

export function PrimaryNav({ active }: PrimaryNavProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/library" className="site-brand">
          <span className="site-brand-mark">CV</span>
          <span>CaliVision Studio</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={active === item.key ? "site-nav-link active" : "site-nav-link"}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/#android-app" className="site-download-cta">
          Download app
        </Link>
      </div>
    </header>
  );
}
