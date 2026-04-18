import { NextResponse } from "next/server";
import { listAdminUsers, requireAdminAccess } from "@/lib/admin/server";

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await listAdminUsers();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ users: result.users });
}
