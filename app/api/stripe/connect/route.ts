import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { appUrl, stripe, stripeConfigured } from "@/lib/stripe";

/**
 * Onboards the agency onto Stripe Connect so their clients can pay them through
 * the platform. Uses an Express account: Stripe handles the identity and payout
 * details, which are exactly the things we do not want to hold.
 */
export async function POST() {
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment." }, { status: 501 });
  }

  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const ws = await repo.loadWorkspace(agencyId);

  let accountId = ws.agency.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "express",
      email: ws.members[0]?.email,
      business_profile: { name: ws.agency.name },
      metadata: { agency_id: agencyId },
    });
    accountId = account.id;
    // Persisted by the account.updated webhook, which is also what flips
    // connect_charges_enabled once Stripe finishes verification.
  }

  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/app/billing"),
    return_url: appUrl("/app/billing?connected=1"),
  });

  return NextResponse.json({ url: link.url, accountId });
}
