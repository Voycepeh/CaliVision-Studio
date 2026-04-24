"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminUserDrill, AdminUserSummary } from "@/lib/admin/types";
import { moderateExchangePublication, type ExchangeModerationAction } from "@/lib/exchange";
import { BrandingAssetsAdmin } from "@/components/admin/BrandingAssetsAdmin";

type AdminPanelProps = {
  canManageRoles: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function AdminPanel({ canManageRoles }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "moderator" | "admin">("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [drillsByUser, setDrillsByUser] = useState<Record<string, AdminUserDrill[]>>({});
  const [pendingRoleUserId, setPendingRoleUserId] = useState<string | null>(null);
  const [pendingModerationPublicationId, setPendingModerationPublicationId] = useState<string | null>(null);

  async function loadUsers(): Promise<void> {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { users?: AdminUserSummary[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load admin users.");
      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers(payload.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!query) return true;
      return [user.displayName, user.email ?? "", user.userId].join(" ").toLowerCase().includes(query);
    });
  }, [users, search, roleFilter]);

  const summary = useMemo(() => {
    const moderators = users.filter((user) => user.role === "moderator" || user.role === "admin").length;
    return {
      totalUsers: users.length,
      moderators,
      publishedDrills: users.reduce((count, user) => count + user.publishedDrillCount, 0)
    };
  }, [users]);

  async function onToggleDrills(userId: string): Promise<void> {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);

    if (drillsByUser[userId]) {
      return;
    }

    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/drills`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { drills?: AdminUserDrill[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load authored drills.");
      return;
    }
    setDrillsByUser((current) => ({ ...current, [userId]: payload.drills ?? [] }));
  }

  async function onSetRole(user: AdminUserSummary, nextRole: "user" | "moderator"): Promise<void> {
    if (!canManageRoles) {
      setError("Only admins can update roles.");
      return;
    }
    setPendingRoleUserId(user.userId);
    setError(null);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.userId)}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to update role.");
      setPendingRoleUserId(null);
      return;
    }

    setUsers((current) => current.map((entry) => (entry.userId === user.userId ? { ...entry, role: nextRole } : entry)));
    setPendingRoleUserId(null);
  }

  async function onModeratePublication(userId: string, sourceDrillId: string, publicationId: string, action: ExchangeModerationAction): Promise<void> {
    const label = action === "hide" ? "Hide publication" : action === "archive" ? "Archive publication" : "Delete publication";
    const confirmed = window.confirm(`${label}?`);
    if (!confirmed) {
      return;
    }
    const reason = window.prompt("Optional moderation note (internal only):", "") ?? "";
    setPendingModerationPublicationId(publicationId);
    const result = await moderateExchangePublication(publicationId, { action, reason });
    setPendingModerationPublicationId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDrillsByUser((current) => ({
      ...current,
      [userId]: (current[userId] ?? []).map((drill) =>
        drill.sourceDrillId === sourceDrillId
          ? {
              ...drill,
              exchangeStatus: result.value,
              publicationIsActive: result.value === "published"
            }
          : drill
      )
    }));
  }

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <BrandingAssetsAdmin />
      <section className="card" style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <article className="card"><strong>{summary.totalUsers}</strong><p className="muted" style={{ margin: 0 }}>Users</p></article>
        <article className="card"><strong>{summary.moderators}</strong><p className="muted" style={{ margin: 0 }}>Moderators/Admins</p></article>
        <article className="card"><strong>{summary.publishedDrills}</strong><p className="muted" style={{ margin: 0 }}>Published drills</p></article>
      </div>

      <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, name, or user ID" style={{ ...inputStyle, minWidth: "280px", flex: "1 1 340px" }} />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)} style={{ ...inputStyle, width: "180px" }}>
          <option value="all">All roles</option>
          <option value="user">Users</option>
          <option value="moderator">Moderators</option>
          <option value="admin">Admins</option>
        </select>
        <button type="button" className="pill" onClick={() => void loadUsers()} disabled={loading}>Refresh</button>
      </div>

      {error ? <p role="alert" style={{ margin: 0, color: "#f3b8b8" }}>{error}</p> : null}
      {loading ? <p className="muted" style={{ margin: 0 }}>Loading admin users…</p> : null}

      {!loading && filteredUsers.length === 0 ? <p className="muted" style={{ margin: 0 }}>No users match your filters.</p> : null}

      <div style={{ display: "grid", gap: "0.6rem" }}>
        {filteredUsers.map((user) => {
          const drills = drillsByUser[user.userId] ?? [];
          const loadingRole = pendingRoleUserId === user.userId;
          return (
            <article key={user.userId} className="card" style={{ display: "grid", gap: "0.45rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{user.displayName}</strong>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>{user.email ?? "No email"}</p>
                  <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.78rem" }}>ID: {user.userId}</p>
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: "0.2rem" }}>
                  <span className="pill">Role: {user.role}</span>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Provider: {user.provider ?? "—"}</span>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Last active: {formatDate(user.lastActiveAtIso)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="muted">Authored drills: {user.authoredDrillCount}</span>
                <span className="muted">Published: {user.publishedDrillCount}</span>
              </div>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button type="button" className="pill" onClick={() => void onToggleDrills(user.userId)}>
                  {expandedUserId === user.userId ? "Hide drills" : "Inspect drills"}
                </button>
                <button type="button" className="pill" disabled={!canManageRoles || loadingRole || user.role === "moderator" || user.role === "admin"} onClick={() => void onSetRole(user, "moderator")}>
                  Set as moderator
                </button>
                <button type="button" className="pill" disabled={!canManageRoles || loadingRole || user.role === "user"} onClick={() => void onSetRole(user, "user")}>
                  Remove moderator
                </button>
              </div>
              {expandedUserId === user.userId ? (
                <section style={{ display: "grid", gap: "0.35rem" }}>
                  {drills.length === 0 ? <p className="muted" style={{ margin: 0 }}>No authored or published drills found.</p> : null}
                  {drills.map((drill) => (
                    <div key={`${user.userId}:${drill.sourceDrillId}:${drill.updatedAtIso}`} style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.45rem" }}>
                      <strong>{drill.title}</strong>
                      <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                        Draft status: {drill.status} • Exchange status: {drill.exchangeStatus ?? "not published"} • Updated {formatDate(drill.updatedAtIso)}
                      </p>
                      {drill.publicationId ? (
                        <>
                          <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                            Publication ID: {drill.publicationId} • Published: {formatDate(drill.publicationPublishedAtIso)} • Publication updated: {formatDate(drill.publicationUpdatedAtIso)} • Active: {drill.publicationIsActive ? "yes" : "no"}
                          </p>
                          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="pill"
                              disabled={pendingModerationPublicationId === drill.publicationId}
                              onClick={() => void onModeratePublication(user.userId, drill.sourceDrillId, drill.publicationId as string, "hide")}
                            >
                              Hide publication
                            </button>
                            <button
                              type="button"
                              className="pill"
                              disabled={pendingModerationPublicationId === drill.publicationId}
                              onClick={() => void onModeratePublication(user.userId, drill.sourceDrillId, drill.publicationId as string, "archive")}
                            >
                              Archive publication
                            </button>
                            <button
                              type="button"
                              className="pill"
                              disabled={pendingModerationPublicationId === drill.publicationId}
                              onClick={() => void onModeratePublication(user.userId, drill.sourceDrillId, drill.publicationId as string, "delete")}
                            >
                              Delete publication
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}
            </article>
          );
        })}
      </div>
      </section>
    </div>
  );
}

const inputStyle = {
  border: "1px solid var(--border)",
  borderRadius: "0.65rem",
  background: "var(--panel)",
  color: "var(--text)",
  padding: "0.5rem 0.65rem"
} as const;
