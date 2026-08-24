import { redirect } from "next/navigation";
import { getRepo, isDemoMode } from "@/lib/db";
import { currentViewer } from "@/lib/auth";
import { BrandStyle } from "@/components/brand";
import { WorkspaceChrome } from "@/components/workspace-chrome";

/**
 * The matchmaker's side of the product. The client portal deliberately does not
 * share this layout — it loads a different, narrower view of the data, so there
 * is no shared component that could accidentally render an internal field.
 */
// The demo store lives on disk and Supabase reads depend on the caller's
// session, so nothing under this segment may be prerendered.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin?next=/app");
  // Signed in but not staff: a client who wandered here goes to their portal,
  // anyone else back to the door.
  if (!viewer.member) {
    redirect(viewer.client ? `/portal/${viewer.client.id}` : "/signin");
  }

  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const ws = await repo.loadWorkspace(agencyId);

  return (
    <>
      <BrandStyle brand={ws.agency.brand} />
      <WorkspaceChrome
        brand={ws.agency.brand}
        agencyName={ws.agency.name}
        clients={ws.clients.map((c) => ({
          id: c.id,
          name: c.name,
          count: ws.items.filter((i) =>
            ws.rosters.some((r) => r.id === i.rosterId && r.clientId === c.id)).length,
        }))}
        demoMode={isDemoMode}
        viewerName={viewer.member.name}
        canSignOut={!isDemoMode}
      >
        {children}
      </WorkspaceChrome>
    </>
  );
}
