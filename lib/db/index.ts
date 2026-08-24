import type { Repo } from "./repo";
import { DemoRepo } from "./demo";
import { SupabaseRepo } from "./supabase-repo";
import { supabaseConfigured } from "./supabase-client";

/**
 * Which store we're talking to is decided purely by whether Supabase env vars
 * are present, so a fresh clone runs against the bundled demo data and the same
 * code runs against Postgres the moment keys exist.
 */
export function getRepo(): Repo {
  return supabaseConfigured ? new SupabaseRepo() : new DemoRepo();
}

export const isDemoMode = !supabaseConfigured;
export type { Repo };
