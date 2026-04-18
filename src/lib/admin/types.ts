export type AdminUserRole = "user" | "moderator" | "admin";

export type AdminUserSummary = {
  userId: string;
  email: string | null;
  displayName: string;
  provider: string | null;
  role: AdminUserRole;
  lastActiveAtIso: string | null;
  authoredDrillCount: number;
  publishedDrillCount: number;
};

export type AdminUserDrill = {
  id: string;
  publicationId: string | null;
  title: string;
  status: string;
  updatedAtIso: string;
  exchangeStatus: string | null;
};

export type AdminUserDetail = {
  user: AdminUserSummary;
  drills: AdminUserDrill[];
};
