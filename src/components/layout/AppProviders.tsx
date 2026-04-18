"use client";

import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ActivityHeartbeat } from "@/components/auth/ActivityHeartbeat";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider><ActivityHeartbeat />{children}</AuthProvider>;
}
