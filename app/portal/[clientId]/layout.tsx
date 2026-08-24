import { notFound } from "next/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRepo, isDemoMode } from "@/lib/db";
import { currentViewer } from "@/lib/auth";
import { BrandStyle, Wordmark } from "@/components/brand";

/**
 * The client's surface. It loads through loadPortal(), which assembles a view
 * containing no private note, no referral source and no internal flags — so the
 * confidentiality guarantee holds even if a component here were careless.
 */
// The demo store lives on disk and Supabase reads depend on the caller's
// session, so nothing under this segment may be prerendered.
export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const viewer = await currentViewer();
  if (!viewer) redirect(`/signin?next=/portal/${clientId}`);
  // A client reaches only their own portal. RLS would return nothing anyway;
  // saying so here turns a blank page into a redirect.
  const isOwnPortal = viewer.client?.id === clientId;
  const isStaffPreview = Boolean(viewer.member);
  if (!isOwnPortal && !isStaffPreview) {
    redirect(viewer.client ? `/portal/${viewer.client.id}` : "/signin");
  }

  const view = await getRepo().loadPortal(clientId);
  if (!view) notFound();

  return (
    <>
      <BrandStyle brand={view.agency.brand} />
      <header className="topbar">
        <div className="topbar-row">
          <div className="topbar-col">
            <span className="eyebrow" style={{ letterSpacing: "0.34em", fontSize: 8 }}>
              Confidential Roster
            </span>
          </div>
          <div className="topbar-col center">
            <Wordmark brand={view.agency.brand} />
          </div>
          <div className="topbar-col right">
            {isStaffPreview ? (
              <Link className="btn ghost" href={`/app/clients/${clientId}`}>
                Back to workspace
              </Link>
            ) : !isDemoMode ? (
              <a className="btn ghost" href="/auth/signout">Sign out</a>
            ) : null}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
