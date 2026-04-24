import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/server";
import { listBrandingAssets, uploadBrandingAsset } from "@/lib/media/admin";

function parseDisplayOrder(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await listBrandingAssets();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ assets: result.assets });
}

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Select an image file to upload." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported for branding assets." }, { status: 400 });
  }

  const result = await uploadBrandingAsset({
    file,
    ownerUserId: access.requesterId,
    title: typeof formData.get("title") === "string" ? formData.get("title")?.toString().trim() || null : null,
    altText: typeof formData.get("altText") === "string" ? formData.get("altText")?.toString().trim() || null : null,
    displayOrder: parseDisplayOrder(formData.get("displayOrder"))
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ asset: result.asset });
}
