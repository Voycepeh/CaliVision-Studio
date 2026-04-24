"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { useAuth } from "@/lib/auth/AuthProvider";

type PrimaryNavProps = {
  active?: "home" | "library" | "studio" | "upload" | "live" | "exchange" | "admin";
};

const items = [
  { href: "/library", label: "Dashboard", key: "library" },
  { href: "/studio", label: "Drill Studio", key: "studio" },
  { href: "/upload", label: "Analysis", key: "upload" },
  { href: "/live", label: "Live & Compare", key: "live" }
] as const;

export function PrimaryNav({ active }: PrimaryNavProps) {
  const { isConfigured, userEmail, signInWithGoogle, signOut, session } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!session) {
      setShowAdmin(false);
      return;
    }
    fetch("/api/exchange/moderation-access")
      .then((response) => response.json())
      .then((payload: { isModerator?: boolean }) => setShowAdmin(payload.isModerator === true))
      .catch(() => setShowAdmin(false));
  }, [session]);

  async function onAuthClick() {
    if (userEmail) {
      const confirmed = window.confirm(
        "Sign out?\n\nYou’ll leave your cloud workspace and switch to browser-only storage. Your cloud My drills stay in your account, but won’t be available until you sign in again. Local browser data and cloud data are separate workspaces."
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
          <span className="site-brand-text">CaliVision</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={active === item.key ? "site-nav-link active" : "site-nav-link"}>
              {item.label}
            </Link>
          ))}
          <Link href="/marketplace" className={active === "exchange" ? "site-nav-link active secondary" : "site-nav-link secondary"}>
            Drill Exchange
          </Link>
          {showAdmin ? (
            <Link href="/admin" className={active === "admin" ? "site-nav-link active" : "site-nav-link"}>
              Admin
            </Link>
          ) : null}
        </nav>
        <button type="button" className="site-download-cta" onClick={() => void onAuthClick()} disabled={!isConfigured}>
          {!isConfigured ? "Local-only mode" : userEmail ? `Sign out (${userEmail})` : "Sign in with Google"}
        </button>
      </div>
    </header>
  );
}
