import type {
  Agency, Booking, Brand, Candidate, ClientFeedback, Debrief, DebriefVoice,
  DispositionKey, Introduction, NetworkProfile, PortalRosterItem, ReferralRequest,
  RosterItem, ReactionKey,
} from "@/lib/types";
import type { CandidateInput, PortalView, Repo, Workspace } from "./repo";
import { serverClient } from "./supabase-client";

/**
 * Postgres-backed implementation. Every call runs under the caller's session,
 * so authorization is the database's job (supabase/migrations/0002_rls.sql) and
 * this file is only responsible for shape.
 *
 * Rosters are tens of rows, so the workspace loads in one batch of selects
 * rather than a query per screen.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const camel = {
  agency: (r: Row): Agency => ({
    id: r.id, slug: r.slug, name: r.name, brand: r.brand as Brand, plan: r.plan,
    stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id,
    subscriptionStatus: r.subscription_status, stripeConnectAccountId: r.stripe_connect_account_id,
    connectChargesEnabled: r.connect_charges_enabled, applicationFeeBps: r.application_fee_bps,
  }),
  candidate: (r: Row): Candidate => ({
    id: r.id, agencyId: r.agency_id, name: r.name, age: r.age, basedIn: r.based_in,
    profession: r.profession, faith: r.faith, about: r.about, photoUrl: r.photo_url,
    photoFrame: r.photo_frame,
    networkListed: r.candidate_internal?.network_listed ?? false,
    consentVersion: r.candidate_internal?.consent_version ?? null,
    consentAt: r.candidate_internal?.consent_at ?? null,
  }),
  item: (r: Row): RosterItem => ({
    id: r.id, rosterId: r.roster_id, candidateId: r.candidate_id, cityId: r.city_id,
    status: r.status, blurb: r.blurb, position: r.position,
    privateNote: r.roster_item_private?.note ?? "",
  }),
  feedback: (r: Row): ClientFeedback => ({
    rosterItemId: r.roster_item_id, reaction: r.reaction, note: r.note, updatedAt: r.updated_at,
  }),
  booking: (r: Row): Booking => ({
    id: r.id, agencyId: r.agency_id, bookingTypeId: r.booking_type_id, clientId: r.client_id,
    candidateId: r.candidate_id, memberId: r.member_id, rosterItemId: r.roster_item_id,
    startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, location: r.location, notes: r.notes,
  }),
  introduction: (r: Row): Introduction => ({
    id: r.id, agencyId: r.agency_id, rosterItemId: r.roster_item_id,
    bookingId: r.booking_id, metAt: r.met_at,
  }),
  debrief: (r: Row): Debrief => ({
    id: r.id, introductionId: r.introduction_id, agencyId: r.agency_id,
    authorKind: r.author_kind, authorId: r.author_id, voice: r.voice,
    provenance: r.provenance, disposition: r.disposition, body: r.body,
    updatedAt: r.updated_at,
  }),
  network: (r: Row): NetworkProfile => ({
    id: r.id, candidateId: r.candidate_id, agencyId: r.agency_id,
    agencyName: r.agency?.name ?? "", ageBand: r.age_band, metro: r.metro,
    professionCategory: r.profession_category, faith: r.faith,
    relocationOpen: r.relocation_open, headline: r.headline, listedAt: r.listed_at,
  }),
  referral: (r: Row): ReferralRequest => ({
    id: r.id, networkProfileId: r.network_profile_id,
    requestingAgencyId: r.requesting_agency_id,
    requestingAgencyName: r.requesting_agency?.name ?? "",
    owningAgencyId: r.owning_agency_id, clientBrief: r.client_brief, message: r.message,
    state: r.state, createdAt: r.created_at, respondedAt: r.responded_at,
    releaseExpiresAt: r.referral_release?.[0]?.expires_at ?? null,
    releasedFields: r.referral_release?.[0]?.released_fields ?? null,
  }),
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;

  async defaultAgencyId() {
    const db = await serverClient();
    const rows = unwrap(await db.from("agency").select("id").limit(1));
    if (!rows?.length) throw new Error("No agency is visible to this session.");
    return rows[0].id as string;
  }

  async loadWorkspace(agencyId: string): Promise<Workspace> {
    const db = await serverClient();
    const [agency, members, clients, rosters, bookingTypes, bookings, introductions, debriefs] =
      await Promise.all([
      db.from("agency").select("*").eq("id", agencyId).single(),
      db.from("agency_member").select("*").eq("agency_id", agencyId),
      db.from("client").select("*").eq("agency_id", agencyId).order("created_at"),
      db.from("roster").select("*").eq("agency_id", agencyId),
      db.from("booking_type").select("*").eq("agency_id", agencyId),
      db.from("booking").select("*").eq("agency_id", agencyId).order("starts_at"),
      db.from("introduction").select("*").eq("agency_id", agencyId),
      db.from("debrief").select("*").eq("agency_id", agencyId),
    ]);

    const clientIds = (unwrap(clients) as Row[]).map((c) => c.id);
    const rosterIds = (unwrap(rosters) as Row[]).map((r) => r.id);

    const [cities, candidates, items] = await Promise.all([
      clientIds.length
        ? db.from("client_city").select("*").in("client_id", clientIds).order("position")
        : Promise.resolve({ data: [] as Row[], error: null }),
      db.from("candidate").select("*, candidate_internal(*)").eq("agency_id", agencyId),
      rosterIds.length
        ? db.from("roster_item")
            .select("*, roster_item_private(note)")
            .in("roster_id", rosterIds).order("position")
        : Promise.resolve({ data: [] as Row[], error: null }),
    ]);

    const itemRows = unwrap(items) as Row[];
    const itemIds = itemRows.map((i) => i.id);
    const feedbackRows = itemIds.length
      ? (unwrap(await db.from("client_feedback").select("*").in("roster_item_id", itemIds)) as Row[])
      : [];

    const internal: Workspace["internal"] = {};
    const candidateRows = unwrap(candidates) as Row[];
    for (const c of candidateRows) {
      internal[c.id] = {
        ig: c.candidate_internal?.ig ?? "",
        source: c.candidate_internal?.source ?? "",
        notes: c.candidate_internal?.notes ?? "",
      };
    }

    const feedback: Workspace["feedback"] = {};
    for (const f of feedbackRows) feedback[f.roster_item_id] = camel.feedback(f);

    return {
      agency: camel.agency(unwrap(agency) as Row),
      members: (unwrap(members) as Row[]).map((m) => ({
        id: m.id, agencyId: m.agency_id, authUserId: m.auth_user_id,
        name: m.name, email: m.email, role: m.role,
      })),
      clients: (unwrap(clients) as Row[]).map((c) => ({
        id: c.id, agencyId: c.agency_id, name: c.name, email: c.email,
        authUserId: c.auth_user_id, active: c.active,
      })),
      cities: (unwrap(cities) as Row[]).map((c) => ({
        id: c.id, clientId: c.client_id, key: c.key, label: c.label, position: c.position,
      })),
      candidates: candidateRows.map(camel.candidate),
      internal,
      rosters: (unwrap(rosters) as Row[]).map((r) => ({
        id: r.id, agencyId: r.agency_id, clientId: r.client_id, title: r.title,
        status: r.status, sharedAt: r.shared_at,
      })),
      items: itemRows.map(camel.item),
      feedback,
      bookingTypes: (unwrap(bookingTypes) as Row[]).map((b) => ({
        id: b.id, agencyId: b.agency_id, name: b.name, kind: b.kind,
        durationMin: b.duration_min, priceCents: b.price_cents, active: b.active,
      })),
      bookings: (unwrap(bookings) as Row[]).map(camel.booking),
      introductions: (unwrap(introductions) as Row[]).map(camel.introduction),
      debriefs: (unwrap(debriefs) as Row[]).map(camel.debrief),
    };
  }

  async loadPortal(clientId: string): Promise<PortalView | null> {
    const db = await serverClient();
    const client = unwrap(
      await db.from("client").select("id, name, agency_id").eq("id", clientId).maybeSingle(),
    ) as Row | null;
    if (!client) return null;

    const agency = unwrap(
      await db.from("agency").select("id, name, brand").eq("id", client.agency_id).single(),
    ) as Row;

    // RLS already hides unshared rosters, but filtering here too keeps the
    // intent legible at the call site.
    const rosters = unwrap(
      await db.from("roster").select("id").eq("client_id", clientId).eq("status", "shared"),
    ) as Row[];
    const rosterIds = rosters.map((r) => r.id);

    const [cities, items] = await Promise.all([
      db.from("client_city").select("*").eq("client_id", clientId).order("position"),
      rosterIds.length
        // Column list is explicit and excludes roster_item_private entirely:
        // the private note is not merely filtered out, it is never joined.
        ? db.from("roster_item")
            .select("id, city_id, status, blurb, position, candidate(id, name, age, based_in, profession, faith, about, photo_url, photo_frame)")
            .in("roster_id", rosterIds).order("position")
        : Promise.resolve({ data: [] as Row[], error: null }),
    ]);

    const itemRows = unwrap(items) as Row[];
    const itemIds = itemRows.map((i) => i.id);
    const feedbackRows = itemIds.length
      ? (unwrap(await db.from("client_feedback").select("*")
          .in("roster_item_id", itemIds)) as Row[])
      : [];
    const byItem = new Map(feedbackRows.map((f) => [f.roster_item_id, camel.feedback(f)]));

    const introRows = itemIds.length
      ? (unwrap(await db.from("introduction").select("*").in("roster_item_id", itemIds)) as Row[])
      : [];
    const introByItem = new Map(introRows.map((r) => [r.roster_item_id, camel.introduction(r)]));
    // voice = 'client' is also all RLS would return here; stating it at the
    // call site keeps the intent visible.
    const myDebriefRows = introRows.length
      ? (unwrap(await db.from("debrief").select("*")
          .in("introduction_id", introRows.map((r) => r.id)).eq("voice", "client")) as Row[])
      : [];
    const debriefByIntro = new Map(myDebriefRows.map((r) => [r.introduction_id, camel.debrief(r)]));

    const portalItems: PortalRosterItem[] = itemRows.flatMap((i) => {
      const c = i.candidate as Row | null;
      if (!c) return [];
      return [{
        id: i.id, cityId: i.city_id, status: i.status, blurb: i.blurb, position: i.position,
        candidate: {
          id: c.id, name: c.name, age: c.age, basedIn: c.based_in, profession: c.profession,
          faith: c.faith, about: c.about, photoUrl: c.photo_url, photoFrame: c.photo_frame,
        },
        feedback: byItem.get(i.id) ?? { rosterItemId: i.id, reaction: null, note: "", updatedAt: null },
        introduction: introByItem.get(i.id) ?? null,
        myDebrief: debriefByIntro.get(introByItem.get(i.id)?.id ?? "") ?? null,
      }];
    });

    return {
      agency: { id: agency.id, name: agency.name, brand: agency.brand as Brand },
      client: { id: client.id, name: client.name },
      cities: (unwrap(cities) as Row[]).map((c) => ({
        id: c.id, clientId: c.client_id, key: c.key, label: c.label, position: c.position,
      })),
      items: portalItems,
    };
  }

  async updateCandidate(id: string, patch: Partial<Candidate> & { ig?: string; source?: string }) {
    const db = await serverClient();
    const { ig, source, ...rest } = patch;
    const cols: Row = {};
    if (rest.name !== undefined) cols.name = rest.name;
    if (rest.age !== undefined) cols.age = rest.age;
    if (rest.basedIn !== undefined) cols.based_in = rest.basedIn;
    if (rest.profession !== undefined) cols.profession = rest.profession;
    if (rest.faith !== undefined) cols.faith = rest.faith;
    if (rest.about !== undefined) cols.about = rest.about;
    if (rest.photoUrl !== undefined) cols.photo_url = rest.photoUrl;
    if (rest.photoFrame !== undefined) cols.photo_frame = rest.photoFrame;
    if (Object.keys(cols).length) {
      cols.updated_at = new Date().toISOString();
      unwrap(await db.from("candidate").update(cols).eq("id", id).select("id"));
    }
    if (ig !== undefined || source !== undefined) {
      const internal: Row = { candidate_id: id };
      if (ig !== undefined) internal.ig = ig;
      if (source !== undefined) internal.source = source;
      unwrap(await db.from("candidate_internal").update(internal).eq("candidate_id", id).select("candidate_id"));
    }
  }

  async updateRosterItem(id: string, patch: Partial<RosterItem>) {
    const db = await serverClient();
    const cols: Row = {};
    if (patch.status !== undefined) cols.status = patch.status;
    if (patch.blurb !== undefined) cols.blurb = patch.blurb;
    if (patch.cityId !== undefined) cols.city_id = patch.cityId;
    if (patch.position !== undefined) cols.position = patch.position;
    if (!Object.keys(cols).length) return;
    unwrap(await db.from("roster_item").update(cols).eq("id", id).select("id"));
  }

  async setPrivateNote(rosterItemId: string, note: string) {
    const db = await serverClient();
    unwrap(await db.from("roster_item_private")
      .upsert({ roster_item_id: rosterItemId, note, updated_at: new Date().toISOString() })
      .select("roster_item_id"));
  }

  async addCandidate(rosterId: string, input: CandidateInput) {
    const db = await serverClient();
    const roster = unwrap(
      await db.from("roster").select("id, agency_id, client_id").eq("id", rosterId).single(),
    ) as Row;

    const candidate = unwrap(await db.from("candidate").insert({
      agency_id: roster.agency_id, name: input.name, age: input.age ?? "",
      based_in: input.basedIn ?? "", profession: input.profession ?? "",
      faith: input.faith ?? "", about: input.about ?? "",
    }).select("id").single()) as Row;

    unwrap(await db.from("candidate_internal").insert({
      candidate_id: candidate.id, agency_id: roster.agency_id,
      ig: input.ig ?? "", source: input.source ?? "",
    }).select("candidate_id"));

    const [city, last] = await Promise.all([
      db.from("client_city").select("id").eq("client_id", roster.client_id)
        .order("position").limit(1).maybeSingle(),
      db.from("roster_item").select("position").eq("roster_id", rosterId)
        .order("position", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const item = unwrap(await db.from("roster_item").insert({
      roster_id: rosterId, candidate_id: candidate.id,
      city_id: (unwrap(city) as Row | null)?.id ?? null,
      status: "maybe", blurb: "",
      position: ((unwrap(last) as Row | null)?.position ?? -1) + 1,
    }).select("id").single()) as Row;

    return { candidateId: candidate.id as string, rosterItemId: item.id as string };
  }

  async removeRosterItem(id: string) {
    const db = await serverClient();
    unwrap(await db.from("roster_item").delete().eq("id", id).select("id"));
  }

  async reorderRoster(rosterId: string, orderedItemIds: string[]) {
    const db = await serverClient();
    await Promise.all(orderedItemIds.map((id, position) =>
      db.from("roster_item").update({ position }).eq("id", id).eq("roster_id", rosterId)));
  }

  async copyCandidatesToClient(candidateIds: string[], targetClientId: string) {
    const db = await serverClient();
    const client = unwrap(
      await db.from("client").select("id, agency_id").eq("id", targetClientId).single(),
    ) as Row;

    let roster = unwrap(
      await db.from("roster").select("id").eq("client_id", targetClientId)
        .order("created_at").limit(1).maybeSingle(),
    ) as Row | null;
    if (!roster) {
      roster = unwrap(await db.from("roster").insert({
        agency_id: client.agency_id, client_id: targetClientId, title: "Introductions",
      }).select("id").single()) as Row;
    }

    const [existing, cities, last, candidates] = await Promise.all([
      db.from("roster_item").select("candidate_id").eq("roster_id", roster.id),
      db.from("client_city").select("id, label").eq("client_id", targetClientId),
      db.from("roster_item").select("position").eq("roster_id", roster.id)
        .order("position", { ascending: false }).limit(1).maybeSingle(),
      db.from("candidate").select("id, based_in").in("id", candidateIds),
    ]);

    const already = new Set((unwrap(existing) as Row[]).map((r) => r.candidate_id));
    const cityRows = unwrap(cities) as Row[];
    let pos = ((unwrap(last) as Row | null)?.position ?? -1);

    const rows = (unwrap(candidates) as Row[])
      .filter((c) => !already.has(c.id))
      .map((c) => ({
        roster_id: roster!.id,
        candidate_id: c.id,
        city_id: cityRows.find((ct) =>
          ct.label.trim().toLowerCase() === String(c.based_in ?? "").trim().toLowerCase())?.id ?? null,
        // A fresh pairing starts with no status, no blurb and no note.
        status: "maybe", blurb: "", position: ++pos,
      }));

    if (!rows.length) return 0;
    unwrap(await db.from("roster_item").insert(rows).select("id"));
    return rows.length;
  }

  async shareRoster(rosterId: string) {
    const db = await serverClient();
    unwrap(await db.from("roster")
      .update({ status: "shared", shared_at: new Date().toISOString() })
      .eq("id", rosterId).select("id"));
  }

  async createClient(agencyId: string, name: string) {
    const db = await serverClient();
    const client = unwrap(await db.from("client")
      .insert({ agency_id: agencyId, name }).select("id").single()) as Row;
    await db.from("client_city").insert(
      ["New York", "Los Angeles", "Miami"].map((label, position) => ({
        client_id: client.id, key: label.toLowerCase().replace(/\s+/g, "-"), label, position,
      })));
    await db.from("roster").insert({ agency_id: agencyId, client_id: client.id, title: "Introductions" });
    return client.id as string;
  }

  async renameClient(id: string, name: string) {
    const db = await serverClient();
    unwrap(await db.from("client").update({ name }).eq("id", id).select("id"));
  }

  async deleteClient(id: string) {
    const db = await serverClient();
    unwrap(await db.from("client").delete().eq("id", id).select("id"));
  }

  async addCity(clientId: string, label: string) {
    const db = await serverClient();
    const last = unwrap(await db.from("client_city").select("position").eq("client_id", clientId)
      .order("position", { ascending: false }).limit(1).maybeSingle()) as Row | null;
    unwrap(await db.from("client_city").insert({
      client_id: clientId, key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label, position: (last?.position ?? -1) + 1,
    }).select("id"));
  }

  async renameCity(id: string, label: string) {
    const db = await serverClient();
    unwrap(await db.from("client_city")
      .update({ label, key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
      .eq("id", id).select("id"));
  }

  async deleteCity(id: string) {
    const db = await serverClient();
    const city = unwrap(
      await db.from("client_city").select("id, client_id").eq("id", id).single(),
    ) as Row;
    const siblings = unwrap(
      await db.from("client_city").select("id").eq("client_id", city.client_id),
    ) as Row[];
    if (siblings.length <= 1) return; // never delete the last tab
    const fallback = siblings.find((c) => c.id !== id)!;
    // roster_item.city_id is ON DELETE SET NULL, so reassign before deleting.
    await db.from("roster_item").update({ city_id: fallback.id }).eq("city_id", id);
    unwrap(await db.from("client_city").delete().eq("id", id).select("id"));
  }

  async setFeedback(rosterItemId: string, patch: { reaction?: ReactionKey | null; note?: string }) {
    const db = await serverClient();
    const item = unwrap(await db.from("roster_item")
      .select("id, roster(client_id)").eq("id", rosterItemId).single()) as Row;
    const clientId = (item.roster as Row)?.client_id;
    const row: Row = {
      roster_item_id: rosterItemId, client_id: clientId, updated_at: new Date().toISOString(),
    };
    if (patch.reaction !== undefined) row.reaction = patch.reaction;
    if (patch.note !== undefined) row.note = patch.note;
    unwrap(await db.from("client_feedback").upsert(row).select("roster_item_id"));
  }

  async logIntroduction(rosterItemId: string, metAt: string | null) {
    const db = await serverClient();
    const existing = unwrap(await db.from("introduction").select("id")
      .eq("roster_item_id", rosterItemId).maybeSingle()) as Row | null;
    if (existing) {
      if (metAt !== null) {
        unwrap(await db.from("introduction").update({ met_at: metAt })
          .eq("id", existing.id).select("id"));
      }
      return existing.id as string;
    }
    const item = unwrap(await db.from("roster_item")
      .select("id, roster(agency_id)").eq("id", rosterItemId).single()) as Row;
    const row = unwrap(await db.from("introduction").insert({
      agency_id: (item.roster as Row).agency_id,
      roster_item_id: rosterItemId,
      met_at: metAt ?? new Date().toISOString(),
    }).select("id").single()) as Row;
    return row.id as string;
  }

  async saveDebrief(input: {
    introductionId: string;
    voice: DebriefVoice;
    authorKind: Debrief["authorKind"];
    provenance: Debrief["provenance"];
    disposition?: DispositionKey | null;
    body?: string;
  }) {
    const db = await serverClient();
    const intro = unwrap(await db.from("introduction").select("id, agency_id")
      .eq("id", input.introductionId).single()) as Row;
    const row: Row = {
      introduction_id: input.introductionId,
      agency_id: intro.agency_id,
      author_kind: input.authorKind,
      voice: input.voice,
      provenance: input.provenance,
      updated_at: new Date().toISOString(),
    };
    if (input.disposition !== undefined) row.disposition = input.disposition;
    if (input.body !== undefined) row.body = input.body;
    // One account per voice per introduction — editing updates in place.
    unwrap(await db.from("debrief")
      .upsert(row, { onConflict: "introduction_id,voice" }).select("id"));
  }

  async updateBrand(agencyId: string, brand: Brand) {
    const db = await serverClient();
    unwrap(await db.from("agency").update({ brand }).eq("id", agencyId).select("id"));
  }

  async createBooking(input: Omit<Booking, "id">) {
    const db = await serverClient();
    const row = unwrap(await db.from("booking").insert({
      agency_id: input.agencyId, booking_type_id: input.bookingTypeId, client_id: input.clientId,
      candidate_id: input.candidateId, member_id: input.memberId, roster_item_id: input.rosterItemId,
      starts_at: input.startsAt, ends_at: input.endsAt, status: input.status,
      location: input.location, notes: input.notes,
    }).select("id").single()) as Row;
    return row.id as string;
  }

  async updateBooking(id: string, patch: Partial<Booking>) {
    const db = await serverClient();
    const cols: Row = {};
    if (patch.status !== undefined) cols.status = patch.status;
    if (patch.startsAt !== undefined) cols.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) cols.ends_at = patch.endsAt;
    if (patch.location !== undefined) cols.location = patch.location;
    if (patch.notes !== undefined) cols.notes = patch.notes;
    if (!Object.keys(cols).length) return;
    unwrap(await db.from("booking").update(cols).eq("id", id).select("id"));
  }

  async setNetworkListing(candidateId: string, listing: {
    listed: boolean; consentVersion?: string; ageBand?: string; metro?: string;
    professionCategory?: string; headline?: string; relocationOpen?: boolean;
  }) {
    const db = await serverClient();
    if (!listing.listed) {
      unwrap(await db.from("candidate_internal").update({ network_listed: false })
        .eq("candidate_id", candidateId).select("candidate_id"));
      await db.from("network_profile").delete().eq("candidate_id", candidateId);
      return;
    }
    if (!listing.consentVersion) {
      throw new Error("A candidate cannot be listed in the network without recorded consent.");
    }
    const candidate = unwrap(await db.from("candidate")
      .select("id, agency_id, age, based_in, faith").eq("id", candidateId).single()) as Row;

    // The consent guard trigger rejects this update if consent is missing, so
    // the listing below can never outrun the consent record.
    unwrap(await db.from("candidate_internal").update({
      network_listed: true, consent_version: listing.consentVersion,
      consent_at: new Date().toISOString(), consent_source: "matchmaker-recorded",
    }).eq("candidate_id", candidateId).select("candidate_id"));

    unwrap(await db.from("network_profile").upsert({
      candidate_id: candidateId, agency_id: candidate.agency_id,
      age_band: listing.ageBand ?? "unspecified",
      metro: listing.metro ?? candidate.based_in,
      profession_category: listing.professionCategory ?? "",
      faith: candidate.faith, relocation_open: listing.relocationOpen ?? false,
      headline: listing.headline ?? "",
    }, { onConflict: "candidate_id" }).select("id"));
  }

  async searchNetwork(agencyId: string, q: { metro?: string; ageBand?: string }) {
    const db = await serverClient();
    let query = db.from("network_profile").select("*, agency(name)").neq("agency_id", agencyId);
    if (q.metro) query = query.ilike("metro", `%${q.metro}%`);
    if (q.ageBand) query = query.eq("age_band", q.ageBand);
    return (unwrap(await query) as Row[]).map(camel.network);
  }

  async listReferrals(agencyId: string) {
    const db = await serverClient();
    const sel = "*, requesting_agency:agency!referral_request_requesting_agency_id_fkey(name), referral_release(expires_at, released_fields)";
    const [incoming, outgoing] = await Promise.all([
      db.from("referral_request").select(sel).eq("owning_agency_id", agencyId)
        .order("created_at", { ascending: false }),
      db.from("referral_request").select(sel).eq("requesting_agency_id", agencyId)
        .order("created_at", { ascending: false }),
    ]);
    return {
      incoming: (unwrap(incoming) as Row[]).map(camel.referral),
      outgoing: (unwrap(outgoing) as Row[]).map(camel.referral),
    };
  }

  async createReferralRequest(input: {
    networkProfileId: string; requestingAgencyId: string; clientBrief: string; message: string;
  }) {
    const db = await serverClient();
    const profile = unwrap(await db.from("network_profile")
      .select("id, agency_id").eq("id", input.networkProfileId).single()) as Row;
    const row = unwrap(await db.from("referral_request").insert({
      network_profile_id: profile.id,
      requesting_agency_id: input.requestingAgencyId,
      owning_agency_id: profile.agency_id,
      client_brief: input.clientBrief, message: input.message,
    }).select("id").single()) as Row;
    return row.id as string;
  }

  async respondToReferral(id: string, decision: "released" | "declined", releasedFields?: string[]) {
    const db = await serverClient();
    unwrap(await db.from("referral_request")
      .update({ state: decision, responded_at: new Date().toISOString() })
      .eq("id", id).select("id"));
    if (decision !== "released") return;

    const req = unwrap(await db.from("referral_request")
      .select("id, requesting_agency_id, network_profile(candidate_id)").eq("id", id).single()) as Row;
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // time-boxed on purpose — ADR-003
    unwrap(await db.from("referral_release").insert({
      referral_request_id: id,
      candidate_id: (req.network_profile as Row).candidate_id,
      to_agency_id: req.requesting_agency_id,
      released_fields: releasedFields ?? ["name", "age", "based_in", "profession", "about"],
      expires_at: expires.toISOString(),
    }).select("id"));
  }
}
