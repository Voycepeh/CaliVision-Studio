"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const LAST_SENT_KEY = "calivision:last-activity-heartbeat";

export function ActivityHeartbeat() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function sendHeartbeat(force = false): Promise<void> {
      if (cancelled) return;
      const now = Date.now();
      const last = Number(window.localStorage.getItem(LAST_SENT_KEY) ?? "0");
      if (!force && Number.isFinite(last) && now - last < HEARTBEAT_INTERVAL_MS) {
        return;
      }

      await fetch("/api/user/activity", { method: "POST" }).catch(() => undefined);
      window.localStorage.setItem(LAST_SENT_KEY, String(now));
    }

    void sendHeartbeat(true);
    const interval = window.setInterval(() => {
      void sendHeartbeat(false);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session]);

  return null;
}
