import Stripe from "stripe";
import type { PlanKey } from "@/lib/types";

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Two revenue legs, deliberately separate:
 *
 *   subscription — the agency pays us monthly for the software.
 *   Connect      — the agency's clients pay the agency through us, and we take
 *                  `application_fee_bps` of it.
 *
 * They are separate Stripe objects on separate accounts, so an agency that
 * never turns on Connect still has a working product, and an agency that
 * churns off the subscription does not strand money owed to them.
 */
export interface Plan {
  key: PlanKey;
  name: string;
  priceLabel: string;
  blurb: string;
  clients: string;
  priceId: string | undefined;
}

export const PLANS: Plan[] = [
  {
    key: "solo",
    name: "Solo",
    priceLabel: "$79",
    blurb: "One matchmaker, branded client portals, scheduling.",
    clients: "Up to 10 active clients",
    priceId: process.env.STRIPE_PRICE_SOLO,
  },
  {
    key: "studio",
    name: "Studio",
    priceLabel: "$249",
    blurb: "A small team, shared candidate database, client payments via Stripe.",
    clients: "Up to 40 active clients",
    priceId: process.env.STRIPE_PRICE_STUDIO,
  },
  {
    key: "house",
    name: "House",
    priceLabel: "$699",
    blurb: "Multiple matchmakers, network referrals, custom domain.",
    clients: "Unlimited clients",
    priceId: process.env.STRIPE_PRICE_HOUSE,
  },
];

export function appUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
