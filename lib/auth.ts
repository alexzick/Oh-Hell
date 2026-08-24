import { serverClient, supabaseConfigured } from "@/lib/db/supabase-client";

/**
 * Who is asking. Two kinds of person reach this application with a session:
 * a matchmaker (a row in agency_member) or a client (a row in client). Someone
 * who is neither can sign in perfectly well and see nothing, which is the
 * correct outcome — see supabase/migrations/0004_auth_binding.sql.
 *
 * In demo mode there is no auth at all and this returns a stand-in matchmaker,
 * so the app runs and the end-to-end tests pass with no keys.
 */
export interface Viewer {
  userId: string;
  email: string;
  member: { id: string; agencyId: string; name: string; role: string } | null;
  client: { id: string; agencyId: string; name: string } | null;
}

const DEMO_VIEWER: Viewer = {
  userId: "demo",
  email: "demo@example.com",
  member: { id: "demo", agencyId: "demo", name: "Demo", role: "owner" },
  client: null,
};

export async function currentViewer(): Promise<Viewer | null> {
  if (!supabaseConfigured) return DEMO_VIEWER;

  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  // Both lookups are RLS-scoped to this user's own row, so an authenticated
  // stranger gets null for both and is shown the door by the layouts.
  const [member, client] = await Promise.all([
    db.from("agency_member").select("id, agency_id, name, role")
      .eq("auth_user_id", user.id).maybeSingle(),
    db.from("client").select("id, agency_id, name")
      .eq("auth_user_id", user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? "",
    member: member.data
      ? {
          id: member.data.id, agencyId: member.data.agency_id,
          name: member.data.name, role: member.data.role,
        }
      : null,
    client: client.data
      ? { id: client.data.id, agencyId: client.data.agency_id, name: client.data.name }
      : null,
  };
}

export const authEnabled = supabaseConfigured;
