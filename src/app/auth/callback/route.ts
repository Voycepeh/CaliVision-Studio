import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function resolveSafeNextPath(nextParam: string | null): string {
  if (!nextParam) return "/library";
  if (!nextParam.startsWith("/")) return "/library";
  if (nextParam.startsWith("//")) return "/library";
  return nextParam;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = resolveSafeNextPath(requestUrl.searchParams.get("next"));

  const supabase = await createServerSupabaseClient();
  if (supabase && code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
