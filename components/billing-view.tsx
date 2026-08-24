"use client";

import { useState } from "react";
import type { PlanKey } from "@/lib/types";

interface PlanCard {
  key: PlanKey; name: string; priceLabel: string;
  blurb: string; clients: string; configured: boolean;
}

export function BillingView({
  agencyName, plan, subscriptionStatus, connectAccountId, connectEnabled,
  applicationFeeBps, plans, stripeConfigured,
}: {
  agencyName: string;
  plan: PlanKey;
  subscriptionStatus: string | null;
  connectAccountId: string | null;
  connectEnabled: boolean;
  applicationFeeBps: number;
  plans: PlanCard[];
  stripeConfigured: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    setError(null);
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="main">
      <div className="page-head" style={{ textAlign: "left", padding: "26px 0 24px" }}>
        <h1 className="page-title">Billing</h1>
        <div className="page-sub" style={{ letterSpacing: "0.18em" }}>
          {agencyName} · {plan} plan{subscriptionStatus ? ` · ${subscriptionStatus}` : ""}
        </div>
      </div>

      {!stripeConfigured && (
        <div className="notice" style={{ marginBottom: 28 }}>
          <strong>Stripe keys not set.</strong> The buttons below are wired to real Checkout and
          Connect endpoints; add <code>STRIPE_SECRET_KEY</code> and the price IDs from{" "}
          <code>.env.example</code> to make them live.
        </div>
      )}
      {error && (
        <div className="notice" style={{ marginBottom: 28, borderColor: "var(--danger)" }}>
          {error}
        </div>
      )}

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Your subscription</div>
        <div className="cards-2">
          {plans.map((p) => (
            <div className="tile" key={p.key}
                 style={p.key === plan ? { borderColor: "var(--ink)" } : undefined}>
              <h3>{p.name}</h3>
              <div className="price">{p.priceLabel}<span> / month</span></div>
              <p style={{ marginTop: 12 }}>{p.blurb}</p>
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>{p.clients}</p>
              <button className="btn" disabled={p.key === plan || busy !== null}
                      onClick={() => post("/api/stripe/checkout", { planKey: p.key })}>
                {p.key === plan ? "Current plan" : busy ? "…" : `Choose ${p.name}`}
              </button>
              {!p.configured && stripeConfigured && (
                <p style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  No price ID configured for this tier.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <hr className="hr" />

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Taking payments from your clients</div>
        <div className="tile">
          <p style={{ maxWidth: 620 }}>
            Connect a Stripe account and your clients can pay their fees in the portal — deposits,
            retainers, or per-introduction. Money settles to your account directly; the platform
            takes {(applicationFeeBps / 100).toFixed(1)}% as an application fee, and Stripe holds
            the identity and payout details rather than us.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="btn" disabled={busy !== null} onClick={() => post("/api/stripe/connect")}>
              {connectAccountId ? "Manage Stripe account" : "Connect Stripe"}
            </button>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
              <span className="dot" style={{
                background: connectEnabled ? "var(--status-yes)" : "var(--status-hold)",
              }} />
              {connectEnabled
                ? "Charges enabled"
                : connectAccountId ? "Onboarding not finished" : "Not connected"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
