"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { useAuth } from "@/lib/auth/AuthProvider";

type PrimaryNavProps = {
  active?: "home" | "library" | "studio" | "upload" | "live" | "exchange" | "admin";
};

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  key: "home" | "library" | "studio" | "upload" | "live" | "exchange";
};

const items: readonly NavItem[] = [
  { href: "/", label: "Home", key: "home" },
  { href: "/library", label: "Library", key: "library" },
  { href: "/studio", label: "Studio", key: "studio" },
  { href: "/upload", label: "Upload Video", mobileLabel: "Upload", key: "upload" },
  { href: "/live", label: "Live Streaming", mobileLabel: "Live", key: "live" },
  { href: "/marketplace", label: "Exchange", key: "exchange" }
] as const;

export function PrimaryNav({ active }: PrimaryNavProps) {
  const { isConfigured, userEmail, signInWithGoogle, signOut, session } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [active]);

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
        <div className="site-header-top-row">
          <Link href="/library" className="site-brand">
            <CaliVisionLogo size="nav" className="site-brand-logo" />
            <span className="site-brand-text">CaliVision</span>
          </Link>
          <div className="site-header-actions">
            <button type="button" className="site-download-cta" onClick={() => void onAuthClick()} disabled={!isConfigured} aria-label={userEmail ? "Sign out" : "Sign in with Google"}>
              <span className="site-download-cta-desktop">{!isConfigured ? "Local-only mode" : userEmail ? `Sign out (${userEmail})` : "Sign in with Google"}</span>
              <span className="site-download-cta-mobile">{!isConfigured ? "Local" : userEmail ? "Account" : "Google"}</span>
            </button>
            <button
              type="button"
              className="site-overflow-button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-expanded={mobileMenuOpen}
              aria-controls="site-mobile-menu"
              aria-label="Open navigation menu"
            >
              ☰
            </button>
          </div>
        </div>
        <nav className="site-nav" aria-label="Primary">
          {items
            .filter((item) => item.key !== "studio")
            .map((item) => (
              <Link key={item.href} href={item.href} className={active === item.key ? "site-nav-link active" : "site-nav-link"}>
                <span className="site-nav-label-desktop">{item.label}</span>
                <span className="site-nav-label-mobile">{item.mobileLabel ?? item.label}</span>
              </Link>
            ))}
          {showAdmin ? (
            <Link href="/admin" className={active === "admin" ? "site-nav-link active" : "site-nav-link"}>
              Admin
            </Link>
          ) : null}
        </nav>
        <div id="site-mobile-menu" className={mobileMenuOpen ? "site-mobile-menu is-open" : "site-mobile-menu"}>
          {showAdmin ? (
            <Link href="/admin" className={active === "admin" ? "site-mobile-menu-link active" : "site-mobile-menu-link"}>
              Admin tools
            </Link>
          ) : null}
          {userEmail ? <p className="site-mobile-menu-email">Signed in as {userEmail}</p> : null}
        </div>
      </div>
    </header>
  );
}
