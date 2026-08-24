/**
 * Domain types for the platform. These mirror the Postgres schema in
 * supabase/migrations — see docs/data-model.md for why fields live where they do.
 *
 * The single most important rule in this file: `RosterItem.privateNote` is
 * matchmaker-only and must never cross into anything a client can read.
 * The portal never selects RosterItem — it selects PortalRosterItem.
 */

export type StatusKey = "yes" | "maybe" | "hold" | "passed";

export const STATUS: Record<StatusKey, { label: string; color: string }> = {
  yes: { label: "Strong fit", color: "#4E7A52" },
  maybe: { label: "Maybe", color: "#B0894B" },
  hold: { label: "Hold", color: "#6E7A8A" },
  passed: { label: "Passed", color: "#B25B4E" },
};

export const STATUS_KEYS = Object.keys(STATUS) as StatusKey[];

/** What the client says back. Deliberately distinct from the matchmaker's status. */
export type ReactionKey = "interested" | "curious" | "pass";

export const REACTION: Record<ReactionKey, { label: string; color: string; verb: string }> = {
  interested: { label: "Interested", color: "#4E7A52", verb: "I'd like to meet her" },
  curious: { label: "Curious", color: "#B0894B", verb: "Tell me more" },
  pass: { label: "Pass", color: "#B25B4E", verb: "Not for me" },
};

export const REACTION_KEYS = Object.keys(REACTION) as ReactionKey[];

/** Per-agency white-label. Rendered as CSS custom properties on <html>. */
export interface Brand {
  displayName: string;
  logoUrl: string | null;
  /** Falls back to displayName in a serif face when logoUrl is null. */
  cream: string;
  panel: string;
  inputBg: string;
  ink: string;
  text2: string;
  textMuted: string;
  serif: string;
  sans: string;
  /** Line printed at the bottom of every client-facing profile. */
  confidentialityNote: string;
}

export type PlanKey = "solo" | "studio" | "house";

export interface Agency {
  id: string;
  slug: string;
  name: string;
  brand: Brand;
  plan: PlanKey;
  /** Stripe billing: the agency pays the platform. */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  /** Stripe Connect: the agency's clients pay the agency, through the platform. */
  stripeConnectAccountId: string | null;
  connectChargesEnabled: boolean;
  /** Basis points the platform takes from client payments. */
  applicationFeeBps: number;
}

export type MemberRole = "owner" | "matchmaker" | "assistant";

export interface Member {
  id: string;
  agencyId: string;
  authUserId: string | null;
  name: string;
  email: string;
  role: MemberRole;
}

export interface City {
  id: string;
  clientId: string;
  key: string;
  label: string;
  position: number;
}

export interface Client {
  id: string;
  agencyId: string;
  name: string;
  email: string | null;
  /** Set once the client accepts their portal invite. */
  authUserId: string | null;
  active: boolean;
}

/**
 * A person in the agency's database. Facts about her that are true regardless
 * of which client is looking — so no status, no blurb, no notes here.
 */
export interface Candidate {
  id: string;
  agencyId: string;
  name: string;
  age: string;
  basedIn: string;
  profession: string;
  faith: string;
  /** Long intro paragraph, shown to clients. */
  about: string;
  photoUrl: string | null;
  photoFrame: PhotoFrame | null;
  /** Network participation — see docs/decisions.md ADR-003. */
  networkListed: boolean;
  consentVersion: string | null;
  consentAt: string | null;
}

export interface PhotoFrame {
  x: number;
  y: number;
  zoom: number;
}

export type RosterStatus = "draft" | "shared";

export interface Roster {
  id: string;
  agencyId: string;
  clientId: string;
  title: string;
  status: RosterStatus;
  sharedAt: string | null;
}

/**
 * One candidate, considered for one client. Everything relationship-specific
 * lives here, which is what makes "copy her to another client's roster" a
 * one-line operation that correctly drops the status, blurb and notes.
 */
export interface RosterItem {
  id: string;
  rosterId: string;
  candidateId: string;
  cityId: string | null;
  status: StatusKey;
  /** One-line "why she's a match". Shown to the client. */
  blurb: string;
  /** MATCHMAKER ONLY. Never leaves the internal surface. */
  privateNote: string;
  position: number;
}

/** The client's own row. The client can write this; the matchmaker can read it. */
export interface ClientFeedback {
  rosterItemId: string;
  reaction: ReactionKey | null;
  note: string;
  updatedAt: string | null;
}

/**
 * Exactly the candidate fields a client may see, written out rather than
 * derived with Omit<> so that adding a field to Candidate can never silently
 * widen what the portal exposes.
 */
export interface PublicCandidate {
  id: string;
  name: string;
  age: string;
  basedIn: string;
  profession: string;
  faith: string;
  about: string;
  photoUrl: string | null;
  photoFrame: PhotoFrame | null;
}

/** Exactly the shape the portal is allowed to see. Note the absences. */
export interface PortalRosterItem {
  id: string;
  candidate: PublicCandidate;
  cityId: string | null;
  status: StatusKey;
  blurb: string;
  position: number;
  feedback: ClientFeedback;
}

// --- Scheduling -------------------------------------------------------------

export type BookingKind = "intake" | "introduction" | "checkin";

export interface BookingType {
  id: string;
  agencyId: string;
  name: string;
  kind: BookingKind;
  durationMin: number;
  /** Optional paid booking, charged through Connect. Zero means free. */
  priceCents: number;
  active: boolean;
}

export type BookingStatus = "proposed" | "confirmed" | "declined" | "completed" | "cancelled";

export interface Booking {
  id: string;
  agencyId: string;
  bookingTypeId: string;
  clientId: string | null;
  candidateId: string | null;
  memberId: string | null;
  rosterItemId: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  location: string;
  notes: string;
}

// --- Network ----------------------------------------------------------------

/**
 * The anonymized projection another agency can search. No name, no photo,
 * no handles, no free text that could identify her. See ADR-003.
 */
export interface NetworkProfile {
  id: string;
  candidateId: string;
  agencyId: string;
  agencyName: string;
  ageBand: string;
  metro: string;
  professionCategory: string;
  faith: string;
  relocationOpen: boolean;
  headline: string;
  listedAt: string;
}

export type ReferralState = "requested" | "released" | "declined" | "withdrawn" | "expired";

export interface ReferralRequest {
  id: string;
  networkProfileId: string;
  /** Agency asking. */
  requestingAgencyId: string;
  requestingAgencyName: string;
  /** Agency that owns the candidate. */
  owningAgencyId: string;
  /** Anonymized brief about the client being matched. */
  clientBrief: string;
  message: string;
  state: ReferralState;
  createdAt: string;
  respondedAt: string | null;
  /** Set when released: scoped, expiring read access to the real candidate. */
  releaseExpiresAt: string | null;
  releasedFields: string[] | null;
}
