import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { PLANS, appUrl, stripe, stripeConfigured } from "@/lib/stripe";

/** Starts the agency's own subscription to the platform. */
export async function POST(request: Request) {
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment." }, { status: 501 });
  }

  const { planKey } = (await request.json()) as { planKey?: string };
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan?.priceId) {
    return NextResponse.json({ error: `No price configured for plan "${planKey}".` }, { status: 400 });
  }

  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const ws = await repo.loadWorkspace(agencyId);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    customer: ws.agency.stripeCustomerId ?? undefined,
    customer_email: ws.agency.stripeCustomerId ? undefined : ws.members[0]?.email,
    success_url: appUrl("/app/billing?upgraded=1"),
    cancel_url: appUrl("/app/billing"),
    // Carried back on the webhook so the subscription lands on the right tenant.
    subscription_data: { metadata: { agency_id: agencyId, plan: plan.key } },
    metadata: { agency_id: agencyId, plan: plan.key },
  });

  return NextResponse.json({ url: session.url });
}
