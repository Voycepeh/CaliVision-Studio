import { NextResponse } from "next/server";
import { getModerationAccess } from "@/lib/exchange/moderation-auth";

export async function GET() {
  const access = await getModerationAccess();
  return NextResponse.json({ isModerator: access.isModerator });
}
