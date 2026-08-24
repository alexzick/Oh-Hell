import type {
  Agency, Booking, BookingType, Candidate, City, Client, ClientFeedback, Member,
  NetworkProfile, PortalRosterItem, ReferralRequest, Roster, RosterItem, StatusKey,
  ReactionKey, Brand,
} from "@/lib/types";

/** Everything the matchmaker workspace needs, in one round trip. */
export interface Workspace {
  agency: Agency;
  members: Member[];
  clients: Client[];
  cities: City[];
  candidates: Candidate[];
  /** candidateId -> internal-only fields. Never sent to a portal response. */
  internal: Record<string, { ig: string; source: string; notes: string }>;
  rosters: Roster[];
  items: RosterItem[];
  /** rosterItemId -> the client's own feedback. */
  feedback: Record<string, ClientFeedback>;
  bookingTypes: BookingType[];
  bookings: Booking[];
}

/**
 * Exactly what the client portal is allowed to load. Assembled server-side and
 * carrying no private note and no internal candidate fields — the portal cannot
 * leak what it was never handed.
 */
export interface PortalView {
  agency: Pick<Agency, "id" | "name" | "brand">;
  client: Pick<Client, "id" | "name">;
  cities: City[];
  items: PortalRosterItem[];
}

export interface CandidateInput {
  name: string;
  age?: string;
  basedIn?: string;
  profession?: string;
  faith?: string;
  about?: string;
  ig?: string;
  source?: string;
}

export interface Repo {
  readonly kind: "demo" | "supabase";

  loadWorkspace(agencyId: string): Promise<Workspace>;
  loadPortal(clientId: string): Promise<PortalView | null>;
  defaultAgencyId(): Promise<string>;

  // --- roster editing (matchmaker) ---
  updateCandidate(id: string, patch: Partial<Candidate> & { ig?: string; source?: string }): Promise<void>;
  updateRosterItem(id: string, patch: Partial<Pick<RosterItem, "status" | "blurb" | "cityId" | "position">>): Promise<void>;
  setPrivateNote(rosterItemId: string, note: string): Promise<void>;
  addCandidate(rosterId: string, input: CandidateInput): Promise<{ candidateId: string; rosterItemId: string }>;
  removeRosterItem(id: string): Promise<void>;
  reorderRoster(rosterId: string, orderedItemIds: string[]): Promise<void>;
  /**
   * Put existing candidates on another client's roster. Status, blurb and the
   * private note are relationship-specific, so the copies start clean.
   */
  copyCandidatesToClient(candidateIds: string[], targetClientId: string): Promise<number>;
  shareRoster(rosterId: string): Promise<void>;

  // --- clients & cities ---
  createClient(agencyId: string, name: string): Promise<string>;
  renameClient(id: string, name: string): Promise<void>;
  deleteClient(id: string): Promise<void>;
  addCity(clientId: string, label: string): Promise<void>;
  renameCity(id: string, label: string): Promise<void>;
  deleteCity(id: string): Promise<void>;

  // --- portal (client) ---
  setFeedback(rosterItemId: string, patch: { reaction?: ReactionKey | null; note?: string }): Promise<void>;

  // --- settings ---
  updateBrand(agencyId: string, brand: Brand): Promise<void>;

  // --- scheduling ---
  createBooking(input: Omit<Booking, "id">): Promise<string>;
  updateBooking(id: string, patch: Partial<Booking>): Promise<void>;

  // --- network ---
  setNetworkListing(candidateId: string, listing: {
    listed: boolean; consentVersion?: string; ageBand?: string; metro?: string;
    professionCategory?: string; headline?: string; relocationOpen?: boolean;
  }): Promise<void>;
  searchNetwork(agencyId: string, q: { metro?: string; ageBand?: string }): Promise<NetworkProfile[]>;
  listReferrals(agencyId: string): Promise<{ incoming: ReferralRequest[]; outgoing: ReferralRequest[] }>;
  createReferralRequest(input: {
    networkProfileId: string; requestingAgencyId: string; clientBrief: string; message: string;
  }): Promise<string>;
  respondToReferral(id: string, decision: "released" | "declined", releasedFields?: string[]): Promise<void>;
}

export type { StatusKey };
