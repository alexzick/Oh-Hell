import { getRepo, isDemoMode } from "@/lib/db";
import { BrandEditor } from "@/components/brand-editor";

export default async function SettingsPage() {
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());
  const portalBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="narrow">
      <div className="page-head" style={{ textAlign: "left", padding: "26px 0 30px" }}>
        <h1 className="page-title">Settings</h1>
        <div className="page-sub" style={{ letterSpacing: "0.18em" }}>
          {ws.agency.name} · {ws.agency.plan} plan
        </div>
      </div>

      <BrandEditor agencyId={ws.agency.id} brand={ws.agency.brand} />

      <hr className="hr" />

      <div className="eyebrow" style={{ marginBottom: 14 }}>Client portal links</div>
      <table className="table">
        <thead>
          <tr><th>Client</th><th>Link</th></tr>
        </thead>
        <tbody>
          {ws.clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--text-2)", wordBreak: "break-all" }}>
                {portalBase}/portal/{c.id}
                <div className="sub">
                  {c.authUserId
                    ? "Signed in — link opens their own account"
                    : "Not yet invited. In production this link is emailed as a one-time magic link, not shared directly."}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isDemoMode && (
        <div className="notice" style={{ marginTop: 24 }}>
          <strong>Demo mode.</strong> Portal links open without signing in so the flow can be walked
          end to end. With Supabase configured, a client reaches their portal through a magic link
          tied to their own account, and row-level security limits them to their own roster.
        </div>
      )}
    </div>
  );
}
