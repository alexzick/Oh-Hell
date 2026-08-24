import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/db/supabase-client";
import { currentViewer } from "@/lib/auth";

/**
 * Completes a magic link. Supabase creates the auth user on first success,
 * which fires the trigger that binds it to the waiting matchmaker or client
 * row — so where we send them afterwards depends on which row they turned out
 * to be, not on anything in the URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const db = await serverClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=exchange_failed`);
  }

  if (next?.startsWith("/")) return NextResponse.redirect(`${origin}${next}`);

  const viewer = await currentViewer();
  if (viewer?.member) return NextResponse.redirect(`${origin}/app`);
  if (viewer?.client) return NextResponse.redirect(`${origin}/portal/${viewer.client.id}`);
  return NextResponse.redirect(`${origin}/signin`);
}
