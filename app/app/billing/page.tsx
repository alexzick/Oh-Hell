import { getRepo } from "@/lib/db";
import { PLANS, stripeConfigured } from "@/lib/stripe";
import { BillingView } from "@/components/billing-view";

export default async function BillingPage() {
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());

  return (
    <BillingView
      agencyName={ws.agency.name}
      plan={ws.agency.plan}
      subscriptionStatus={ws.agency.subscriptionStatus}
      connectAccountId={ws.agency.stripeConnectAccountId}
      connectEnabled={ws.agency.connectChargesEnabled}
      applicationFeeBps={ws.agency.applicationFeeBps}
      plans={PLANS.map((p) => ({
        key: p.key, name: p.name, priceLabel: p.priceLabel,
        blurb: p.blurb, clients: p.clients, configured: Boolean(p.priceId),
      }))}
      stripeConfigured={stripeConfigured}
    />
  );
}
