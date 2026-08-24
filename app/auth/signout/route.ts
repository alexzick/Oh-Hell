import { NextResponse, type NextRequest } from "next/server";
import { serverClient, supabaseConfigured } from "@/lib/db/supabase-client";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  if (supabaseConfigured) {
    const db = await serverClient();
    await db.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/signin`);
}

export const POST = GET;
