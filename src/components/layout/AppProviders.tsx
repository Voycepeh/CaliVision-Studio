"use client";

import { AuthProvider } from "@/lib/auth/AuthProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
