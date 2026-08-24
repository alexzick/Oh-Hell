import { notFound } from "next/navigation";
import Link from "next/link";
import { getRepo, isDemoMode } from "@/lib/db";
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
            {isDemoMode && (
              <Link className="btn ghost" href={`/app/clients/${clientId}`}>
                Back to workspace
              </Link>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
