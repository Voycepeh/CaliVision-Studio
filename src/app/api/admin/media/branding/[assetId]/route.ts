import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/server";
import { deleteBrandingAsset, updateBrandingAsset } from "@/lib/media/admin";

type Context = {
  params: Promise<{ assetId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const payload = (await request.json().catch(() => null)) as {
    title?: string | null;
    altText?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  } | null;

  if (!payload) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { assetId } = await context.params;

  const result = await updateBrandingAsset(assetId, {
    title: payload.title?.trim() || null,
    altText: payload.altText?.trim() || null,
    displayOrder: Number.isFinite(payload.displayOrder) ? Number(payload.displayOrder) : 0,
    isActive: payload.isActive !== false
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ asset: result.asset });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { assetId } = await context.params;
  const result = await deleteBrandingAsset(assetId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
