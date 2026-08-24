import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Agency, Booking, BookingType, Brand, Candidate, City, Client, ClientFeedback,
  Member, NetworkProfile, PortalRosterItem, ReferralRequest, Roster, RosterItem,
  ReactionKey,
} from "@/lib/types";
import type { CandidateInput, PortalView, Repo, Workspace } from "./repo";
import seed from "@/data/seed-unicorn-club.json";

/**
 * File-backed store so the app runs with no Supabase project, no keys and no
 * network — `npm run dev` and the real Unicorn Club roster is there.
 *
 * It is a development convenience, not a second production path: it holds one
 * process's worth of state and does no authorization. Every rule that matters
 * lives in the SQL policies (supabase/migrations/0002_rls.sql); this adapter
 * simply mirrors the shape those policies return.
 */

interface DemoState {
  agency: Agency;
  members: Member[];
  clients: Client[];
  cities: City[];
  candidates: Candidate[];
  candidateInternal: { candidateId: string; ig: string; source: string; notes?: string }[];
  rosters: Roster[];
  rosterItems: RosterItem[];
  feedback: ClientFeedback[];
  bookingTypes: BookingType[];
  bookings: Booking[];
  networkProfiles: NetworkProfile[];
  referrals: ReferralRequest[];
}

const FILE = path.join(process.cwd(), ".data", "demo.json");

const globalForDemo = globalThis as unknown as { __ucDemo?: Promise<DemoState> };

async function load(): Promise<DemoState> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as DemoState;
  } catch {
    const s = structuredClone(seed) as unknown as Partial<DemoState>;
    return {
      agency: s.agency as Agency,
      members: s.members ?? [],
      clients: s.clients ?? [],
      cities: s.cities ?? [],
      candidates: s.candidates ?? [],
      candidateInternal: s.candidateInternal ?? [],
      rosters: s.rosters ?? [],
      rosterItems: s.rosterItems ?? [],
      feedback: s.feedback ?? [],
      bookingTypes: s.bookingTypes ?? [],
      bookings: s.bookings ?? [],
      networkProfiles: [],
      referrals: [],
    };
  }
}

function state(): Promise<DemoState> {
  globalForDemo.__ucDemo ??= load();
  return globalForDemo.__ucDemo;
}

let writeQueue: Promise<unknown> = Promise.resolve();
async function persist(s: DemoState) {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(s, null, 2));
  }).catch(() => {});
  return writeQueue;
}

async function mutate(fn: (s: DemoState) => void | Promise<void>) {
  const s = await state();
  await fn(s);
  await persist(s);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || randomUUID().slice(0, 8);
}

/** Age is stored as free text, so band it defensively. */
function ageBand(age: string): string {
  const n = parseInt(age, 10);
  if (!Number.isFinite(n)) return "unspecified";
  const lo = Math.floor(n / 5) * 5;
  return `${lo}–${lo + 4}`;
}

export class DemoRepo implements Repo {
  readonly kind = "demo" as const;

  async defaultAgencyId() {
    return (await state()).agency.id;
  }

  async loadWorkspace(): Promise<Workspace> {
    const s = await state();
    const internal: Workspace["internal"] = {};
    for (const row of s.candidateInternal) {
      internal[row.candidateId] = { ig: row.ig ?? "", source: row.source ?? "", notes: row.notes ?? "" };
    }
    const feedback: Workspace["feedback"] = {};
    for (const f of s.feedback) feedback[f.rosterItemId] = f;
    return {
      agency: s.agency,
      members: s.members,
      clients: s.clients,
      cities: s.cities,
      candidates: s.candidates,
      internal,
      rosters: s.rosters,
      items: s.rosterItems,
      feedback,
      bookingTypes: s.bookingTypes,
      bookings: s.bookings,
    };
  }

  async loadPortal(clientId: string): Promise<PortalView | null> {
    const s = await state();
    const client = s.clients.find((c) => c.id === clientId);
    if (!client) return null;
    // Only shared rosters are visible to a client — same rule the SQL policy
    // client_can_read_roster() enforces in production.
    const rosters = s.rosters.filter((r) => r.clientId === clientId && r.status === "shared");
    const rosterIds = new Set(rosters.map((r) => r.id));
    const feedbackByItem = new Map(s.feedback.map((f) => [f.rosterItemId, f]));

    const items: PortalRosterItem[] = s.rosterItems
      .filter((i) => rosterIds.has(i.rosterId))
      .sort((a, b) => a.position - b.position)
      .flatMap((i) => {
        const c = s.candidates.find((x) => x.id === i.candidateId);
        if (!c) return [];
        // Note what is *not* copied across: privateNote, source, ig, consent.
        return [{
          id: i.id,
          cityId: i.cityId,
          status: i.status,
          blurb: i.blurb,
          position: i.position,
          candidate: {
            id: c.id, name: c.name, age: c.age, basedIn: c.basedIn,
            profession: c.profession, faith: c.faith, about: c.about,
            photoUrl: c.photoUrl, photoFrame: c.photoFrame,
          },
          feedback: feedbackByItem.get(i.id) ?? {
            rosterItemId: i.id, reaction: null, note: "", updatedAt: null,
          },
        }];
      });

    return {
      agency: { id: s.agency.id, name: s.agency.name, brand: s.agency.brand },
      client: { id: client.id, name: client.name },
      cities: s.cities.filter((c) => c.clientId === clientId).sort((a, b) => a.position - b.position),
      items,
    };
  }

  async updateCandidate(id: string, patch: Partial<Candidate> & { ig?: string; source?: string }) {
    await mutate((s) => {
      const c = s.candidates.find((x) => x.id === id);
      if (c) {
        const { ig, source, ...rest } = patch;
        Object.assign(c, rest);
        if (ig !== undefined || source !== undefined) {
          let row = s.candidateInternal.find((x) => x.candidateId === id);
          if (!row) { row = { candidateId: id, ig: "", source: "" }; s.candidateInternal.push(row); }
          if (ig !== undefined) row.ig = ig;
          if (source !== undefined) row.source = source;
        }
      }
    });
  }

  async updateRosterItem(id: string, patch: Partial<RosterItem>) {
    await mutate((s) => {
      const i = s.rosterItems.find((x) => x.id === id);
      if (i) Object.assign(i, patch);
    });
  }

  async setPrivateNote(rosterItemId: string, note: string) {
    await mutate((s) => {
      const i = s.rosterItems.find((x) => x.id === rosterItemId);
      if (i) i.privateNote = note;
    });
  }

  async addCandidate(rosterId: string, input: CandidateInput) {
    const candidateId = randomUUID();
    const rosterItemId = randomUUID();
    await mutate((s) => {
      const roster = s.rosters.find((r) => r.id === rosterId);
      if (!roster) return;
      s.candidates.push({
        id: candidateId, agencyId: s.agency.id, name: input.name,
        age: input.age ?? "", basedIn: input.basedIn ?? "", profession: input.profession ?? "",
        faith: input.faith ?? "", about: input.about ?? "", photoUrl: null, photoFrame: null,
        networkListed: false, consentVersion: null, consentAt: null,
      });
      s.candidateInternal.push({ candidateId, ig: input.ig ?? "", source: input.source ?? "" });
      const city = s.cities.find((c) => c.clientId === roster.clientId);
      const maxPos = s.rosterItems.filter((i) => i.rosterId === rosterId)
        .reduce((m, i) => Math.max(m, i.position), -1);
      s.rosterItems.push({
        id: rosterItemId, rosterId, candidateId, cityId: city?.id ?? null,
        status: "maybe", blurb: "", privateNote: "", position: maxPos + 1,
      });
    });
    return { candidateId, rosterItemId };
  }

  async removeRosterItem(id: string) {
    await mutate((s) => {
      s.rosterItems = s.rosterItems.filter((i) => i.id !== id);
      s.feedback = s.feedback.filter((f) => f.rosterItemId !== id);
    });
  }

  async reorderRoster(rosterId: string, orderedItemIds: string[]) {
    await mutate((s) => {
      orderedItemIds.forEach((id, idx) => {
        const i = s.rosterItems.find((x) => x.id === id && x.rosterId === rosterId);
        if (i) i.position = idx;
      });
    });
  }

  async copyCandidatesToClient(candidateIds: string[], targetClientId: string) {
    let copied = 0;
    await mutate((s) => {
      let roster = s.rosters.find((r) => r.clientId === targetClientId);
      if (!roster) {
        roster = {
          id: randomUUID(), agencyId: s.agency.id, clientId: targetClientId,
          title: "Introductions", status: "draft", sharedAt: null,
        };
        s.rosters.push(roster);
      }
      const existing = new Set(
        s.rosterItems.filter((i) => i.rosterId === roster!.id).map((i) => i.candidateId),
      );
      let pos = s.rosterItems.filter((i) => i.rosterId === roster!.id)
        .reduce((m, i) => Math.max(m, i.position), -1);
      for (const cid of candidateIds) {
        if (existing.has(cid)) continue;
        const cand = s.candidates.find((c) => c.id === cid);
        if (!cand) continue;
        // Match the candidate's home city to a tab on the target roster if one
        // exists; otherwise leave her ungrouped rather than guessing.
        const city = s.cities.find(
          (c) => c.clientId === targetClientId &&
            c.label.trim().toLowerCase() === cand.basedIn.trim().toLowerCase(),
        );
        s.rosterItems.push({
          id: randomUUID(), rosterId: roster!.id, candidateId: cid,
          cityId: city?.id ?? null,
          // Deliberately blank: status, blurb and note describe a pairing, and
          // this is a new pairing.
          status: "maybe", blurb: "", privateNote: "", position: ++pos,
        });
        copied++;
      }
    });
    return copied;
  }

  async shareRoster(rosterId: string) {
    await mutate((s) => {
      const r = s.rosters.find((x) => x.id === rosterId);
      if (r) { r.status = "shared"; r.sharedAt = new Date().toISOString(); }
    });
  }

  async createClient(agencyId: string, name: string) {
    const id = randomUUID();
    await mutate((s) => {
      s.clients.push({ id, agencyId, name, email: null, authUserId: null, active: true });
      ["New York", "Los Angeles", "Miami"].forEach((label, position) => {
        s.cities.push({ id: randomUUID(), clientId: id, key: slugify(label), label, position });
      });
      s.rosters.push({
        id: randomUUID(), agencyId, clientId: id, title: "Introductions",
        status: "draft", sharedAt: null,
      });
    });
    return id;
  }

  async renameClient(id: string, name: string) {
    await mutate((s) => {
      const c = s.clients.find((x) => x.id === id);
      if (c) c.name = name;
    });
  }

  async deleteClient(id: string) {
    await mutate((s) => {
      const rosterIds = new Set(s.rosters.filter((r) => r.clientId === id).map((r) => r.id));
      s.rosterItems = s.rosterItems.filter((i) => !rosterIds.has(i.rosterId));
      s.rosters = s.rosters.filter((r) => r.clientId !== id);
      s.cities = s.cities.filter((c) => c.clientId !== id);
      s.clients = s.clients.filter((c) => c.id !== id);
    });
  }

  async addCity(clientId: string, label: string) {
    await mutate((s) => {
      const position = s.cities.filter((c) => c.clientId === clientId).length;
      s.cities.push({ id: randomUUID(), clientId, key: slugify(label), label, position });
    });
  }

  async renameCity(id: string, label: string) {
    await mutate((s) => {
      const c = s.cities.find((x) => x.id === id);
      if (c) { c.label = label; c.key = slugify(label); }
    });
  }

  async deleteCity(id: string) {
    await mutate((s) => {
      const city = s.cities.find((c) => c.id === id);
      if (!city) return;
      const siblings = s.cities.filter((c) => c.clientId === city.clientId);
      if (siblings.length <= 1) return; // never delete the last tab
      const fallback = siblings.find((c) => c.id !== id)!;
      for (const i of s.rosterItems) if (i.cityId === id) i.cityId = fallback.id;
      s.cities = s.cities.filter((c) => c.id !== id);
    });
  }

  async setFeedback(rosterItemId: string, patch: { reaction?: ReactionKey | null; note?: string }) {
    await mutate((s) => {
      const item = s.rosterItems.find((i) => i.id === rosterItemId);
      if (!item) return;
      const roster = s.rosters.find((r) => r.id === item.rosterId);
      if (!roster) return;
      let f = s.feedback.find((x) => x.rosterItemId === rosterItemId);
      if (!f) {
        f = { rosterItemId, reaction: null, note: "", updatedAt: null };
        s.feedback.push(f);
      }
      if (patch.reaction !== undefined) f.reaction = patch.reaction;
      if (patch.note !== undefined) f.note = patch.note;
      f.updatedAt = new Date().toISOString();
    });
  }

  async updateBrand(agencyId: string, brand: Brand) {
    await mutate((s) => { s.agency.brand = brand; });
  }

  async createBooking(input: Omit<Booking, "id">) {
    const id = randomUUID();
    await mutate((s) => { s.bookings.push({ ...input, id }); });
    return id;
  }

  async updateBooking(id: string, patch: Partial<Booking>) {
    await mutate((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    });
  }

  async setNetworkListing(candidateId: string, listing: {
    listed: boolean; consentVersion?: string; ageBand?: string; metro?: string;
    professionCategory?: string; headline?: string; relocationOpen?: boolean;
  }) {
    await mutate((s) => {
      const cand = s.candidates.find((c) => c.id === candidateId);
      if (!cand) return;
      if (!listing.listed) {
        cand.networkListed = false;
        s.networkProfiles = s.networkProfiles.filter((p) => p.candidateId !== candidateId);
        return;
      }
      // Mirrors the candidate_internal_consent_guard trigger: no consent on
      // record, no listing.
      if (!listing.consentVersion) {
        throw new Error("A candidate cannot be listed in the network without recorded consent.");
      }
      cand.networkListed = true;
      cand.consentVersion = listing.consentVersion;
      cand.consentAt = new Date().toISOString();
      const existing = s.networkProfiles.find((p) => p.candidateId === candidateId);
      const profile: NetworkProfile = {
        id: existing?.id ?? randomUUID(),
        candidateId,
        agencyId: s.agency.id,
        agencyName: s.agency.name,
        ageBand: listing.ageBand ?? ageBand(cand.age),
        metro: listing.metro ?? cand.basedIn,
        professionCategory: listing.professionCategory ?? "",
        faith: cand.faith,
        relocationOpen: listing.relocationOpen ?? false,
        headline: listing.headline ?? "",
        listedAt: existing?.listedAt ?? new Date().toISOString(),
      };
      if (existing) Object.assign(existing, profile);
      else s.networkProfiles.push(profile);
    });
  }

  async searchNetwork(agencyId: string, q: { metro?: string; ageBand?: string }) {
    const s = await state();
    return s.networkProfiles.filter((p) =>
      p.agencyId !== agencyId &&
      (!q.metro || p.metro.toLowerCase().includes(q.metro.toLowerCase())) &&
      (!q.ageBand || p.ageBand === q.ageBand));
  }

  async listReferrals(agencyId: string) {
    const s = await state();
    return {
      incoming: s.referrals.filter((r) => r.owningAgencyId === agencyId),
      outgoing: s.referrals.filter((r) => r.requestingAgencyId === agencyId),
    };
  }

  async createReferralRequest(input: {
    networkProfileId: string; requestingAgencyId: string; clientBrief: string; message: string;
  }) {
    const id = randomUUID();
    await mutate((s) => {
      const profile = s.networkProfiles.find((p) => p.id === input.networkProfileId);
      if (!profile) throw new Error("Unknown network profile.");
      s.referrals.push({
        id,
        networkProfileId: input.networkProfileId,
        requestingAgencyId: input.requestingAgencyId,
        requestingAgencyName: s.agency.name,
        owningAgencyId: profile.agencyId,
        clientBrief: input.clientBrief,
        message: input.message,
        state: "requested",
        createdAt: new Date().toISOString(),
        respondedAt: null,
        releaseExpiresAt: null,
        releasedFields: null,
      });
    });
    return id;
  }

  async respondToReferral(id: string, decision: "released" | "declined", releasedFields?: string[]) {
    await mutate((s) => {
      const r = s.referrals.find((x) => x.id === id);
      if (!r) return;
      r.state = decision;
      r.respondedAt = new Date().toISOString();
      if (decision === "released") {
        // Access is time-boxed on purpose; see ADR-003.
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        r.releaseExpiresAt = expires.toISOString();
        r.releasedFields = releasedFields ?? ["name", "age", "basedIn", "profession", "about"];
      }
    });
  }
}
