import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { serviceClient } from "@/lib/db/supabase-client";

/**
 * Stripe is the source of truth for billing state; this handler only mirrors it.
 *
 * Two things make it safe to replay: the signature check (a forged POST cannot
 * grant anyone a subscription) and the stripe_event ledger (a redelivered event
 * is a no-op). It runs under the service role because a webhook has no user
 * session to carry.
 */
export async function POST(request: Request) {
  if (!stripeConfigured || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const db = serviceClient();

  // Idempotency: the insert fails on a duplicate id, which means we've already
  // applied this event.
  const { error: seen } = await db.from("stripe_event")
    .insert({ id: event.id, type: event.type });
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const agencyId = session.metadata?.agency_id;
      if (agencyId) {
        await db.from("agency").update({
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === "string" ? session.subscription : null,
          subscription_status: "active",
          plan: session.metadata?.plan ?? "solo",
        }).eq("id", agencyId);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const agencyId = sub.metadata?.agency_id;
      const patch = {
        subscription_status: event.type.endsWith("deleted") ? "canceled" : sub.status,
      };
      // Prefer the subscription id: metadata can be missing on older objects.
      await (agencyId
        ? db.from("agency").update(patch).eq("id", agencyId)
        : db.from("agency").update(patch).eq("stripe_subscription_id", sub.id));
      break;
    }

    case "account.updated": {
      const account = event.data.object;
      const agencyId = account.metadata?.agency_id;
      if (agencyId) {
        await db.from("agency").update({
          stripe_connect_account_id: account.id,
          connect_charges_enabled: Boolean(account.charges_enabled),
        }).eq("id", agencyId);
      }
      break;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object;
      await db.from("payment")
        .update({ status: "succeeded" })
        .eq("stripe_payment_intent_id", intent.id);
      break;
    }

    default:
      // Everything else is recorded in stripe_event and ignored on purpose.
      break;
  }

  return NextResponse.json({ received: true });
}
