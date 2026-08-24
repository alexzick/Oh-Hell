"use client";

import { useTransition } from "react";
import type { NetworkProfile, ReferralRequest } from "@/lib/types";
import { createReferralRequestAction, respondToReferralAction } from "@/lib/actions";

interface Listing {
  candidateId: string; name: string; ageBand: string;
  metro: string; professionCategory: string; faith: string;
}

export function NetworkView({
  agencyName, ourListings, results, incoming, outgoing, candidateNameFor,
}: {
  agencyName: string;
  ourListings: Listing[];
  results: NetworkProfile[];
  incoming: ReferralRequest[];
  outgoing: ReferralRequest[];
  candidateNameFor: Record<string, string>;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="main">
      <div className="page-head" style={{ textAlign: "left", padding: "26px 0 24px" }}>
        <h1 className="page-title">Network</h1>
        <div className="page-sub" style={{ letterSpacing: "0.18em" }}>
          Referrals between agencies · nothing leaves {agencyName} without your say-so
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 34, maxWidth: 760 }}>
        <strong>How this works.</strong> Other agencies never browse your database. They search
        anonymized cards — age band, metro, profession category, faith — and if one looks right for
        their client, they ask you for an introduction. You decide what to release, to whom, and it
        expires. A woman appears here only after her consent is recorded against her profile.
      </div>

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Your listings · exactly what another agency sees
        </div>
        {ourListings.length === 0 ? (
          <div className="empty" style={{ padding: "50px 20px" }}>
            <p>You haven&rsquo;t listed anyone. Open a profile and use &ldquo;List anonymously&rdquo;.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Age</th><th>Metro</th><th>Profession</th><th>Faith</th><th>Hidden from them</th></tr>
            </thead>
            <tbody>
              {ourListings.map((l) => (
                <tr key={l.candidateId}>
                  <td>{l.ageBand}</td>
                  <td>{l.metro || "—"}</td>
                  <td>{l.professionCategory || "—"}</td>
                  <td>{l.faith || "—"}</td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "var(--sans)", fontSize: 12 }}>
                    {l.name}, her photo, handles and all notes
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <hr className="hr" />

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Search other agencies</div>
        {results.length === 0 ? (
          <div className="empty" style={{ padding: "50px 20px" }}>
            <p>No other agencies are listing candidates yet.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Age</th><th>Metro</th><th>Profession</th><th>Agency</th><th /></tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.id}>
                  <td>{p.ageBand}<div className="sub">{p.headline}</div></td>
                  <td>{p.metro}</td>
                  <td>{p.professionCategory}</td>
                  <td>{p.agencyName}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn ghost" onClick={() => {
                      const brief = window.prompt(
                        "Describe your client for the other matchmaker — no name, just what matters for fit:",
                      );
                      if (!brief?.trim()) return;
                      startTransition(() => {
                        void createReferralRequestAction({
                          networkProfileId: p.id, clientBrief: brief.trim(), message: "",
                        });
                      });
                    }}>Request an introduction</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <hr className="hr" />

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Requests for your candidates</div>
        {incoming.length === 0 ? (
          <div className="empty" style={{ padding: "50px 20px" }}><p>No requests right now.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>From</th><th>Their client</th><th>State</th><th /></tr>
            </thead>
            <tbody>
              {incoming.map((r) => (
                <tr key={r.id}>
                  <td>{r.requestingAgencyName || "Another agency"}</td>
                  <td>{r.clientBrief}</td>
                  <td>
                    {r.state}
                    {r.releaseExpiresAt && (
                      <div className="sub">
                        access until {new Date(r.releaseExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.state === "requested" && (
                      <>
                        <button className="btn ghost" style={{ marginRight: 8 }} onClick={() => {
                          if (!window.confirm(
                            "Release her name, age, city, profession and introduction to this agency for 30 days?",
                          )) return;
                          startTransition(() => { void respondToReferralAction(r.id, "released"); });
                        }}>Release</button>
                        <button className="btn danger"
                                onClick={() => startTransition(() => { void respondToReferralAction(r.id, "declined"); })}>
                          Decline
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {outgoing.length > 0 && (
        <>
          <hr className="hr" />
          <section>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Your requests</div>
            <table className="table">
              <thead><tr><th>Requested</th><th>State</th><th>Released</th></tr></thead>
              <tbody>
                {outgoing.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td>{r.state}</td>
                    <td style={{ color: "var(--text-muted)", fontFamily: "var(--sans)", fontSize: 12 }}>
                      {r.releasedFields?.length
                        ? r.releasedFields.join(", ")
                        : "—"}
                      {r.state === "released" && candidateNameFor[r.networkProfileId] && (
                        <div className="sub">{candidateNameFor[r.networkProfileId]}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
