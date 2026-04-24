import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/server";
import {
  getHomepageCarouselDurationSecondsForAdmin,
  HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS,
  HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS,
  saveHomepageCarouselDurationSeconds,
} from "@/lib/media/homepage-carousel-settings";

function parseDurationSeconds(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS || rounded > HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS) {
    return null;
  }
  return rounded;
}

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await getHomepageCarouselDurationSecondsForAdmin();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ seconds: result.seconds });
}

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const payload = (await request.json().catch(() => null)) as { seconds?: unknown } | null;
  const seconds = parseDurationSeconds(payload?.seconds);
  if (seconds === null) {
    return NextResponse.json({ error: `Duration must be an integer from ${HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS} to ${HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS} seconds.` }, { status: 400 });
  }

  const result = await saveHomepageCarouselDurationSeconds(seconds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ seconds: result.seconds });
}
