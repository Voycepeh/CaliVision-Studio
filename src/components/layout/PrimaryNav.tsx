"use client";

import Link from "next/link";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { useAuth } from "@/lib/auth/AuthProvider";

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
  const { isConfigured, userEmail, signInWithGoogle, signOut } = useAuth();

  async function onAuthClick() {
    if (userEmail) {
      const confirmed = window.confirm(
        "Sign out?\n\nYou’ll leave your cloud workspace and switch to browser-only storage. Your cloud Drafts and My drills stay in your account, but won’t be available until you sign in again. Local browser data and cloud data are separate workspaces."
      );
      if (!confirmed) {
        return;
      }
      await signOut();
      return;
    }

    const result = await signInWithGoogle();
    if (!result.ok) {
      window.alert(result.error ?? "Google sign-in failed.");
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/library" className="site-brand">
          <CaliVisionLogo size="nav" className="site-brand-logo" />
          <span className="site-brand-text">CaliVision Studio</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={active === item.key ? "site-nav-link active" : "site-nav-link"}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="site-download-cta" onClick={() => void onAuthClick()} disabled={!isConfigured}>
          {!isConfigured ? "Local-only mode" : userEmail ? `Sign out (${userEmail})` : "Sign in with Google"}
        </button>
      </div>
    </header>
  );
}
