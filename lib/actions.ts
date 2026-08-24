"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/db";
import type {
  Candidate, ReactionKey, RosterItem, Brand, Booking, DispositionKey,
} from "@/lib/types";

/**
 * Every mutation the UI can perform. They are thin on purpose: authorization
 * belongs to the database's row-level security, and business rules that must
 * hold regardless of caller (consent before listing, blank status on a copied
 * pairing) belong to the repo and to SQL triggers.
 */

function revalidateWorkspace() {
  revalidatePath("/app", "layout");
}

export async function updateCandidateAction(
  id: string,
  patch: Partial<Candidate> & { ig?: string; source?: string },
) {
  await getRepo().updateCandidate(id, patch);
  revalidateWorkspace();
}

export async function updateRosterItemAction(id: string, patch: Partial<RosterItem>) {
  await getRepo().updateRosterItem(id, patch);
  revalidateWorkspace();
}

export async function setPrivateNoteAction(rosterItemId: string, note: string) {
  await getRepo().setPrivateNote(rosterItemId, note);
  revalidateWorkspace();
}

export async function addCandidateAction(clientId: string, rosterId: string) {
  const { rosterItemId } = await getRepo().addCandidate(rosterId, { name: "New candidate" });
  revalidateWorkspace();
  redirect(`/app/clients/${clientId}/${rosterItemId}`);
}

export async function removeRosterItemAction(id: string) {
  await getRepo().removeRosterItem(id);
  revalidateWorkspace();
}

export async function reorderRosterAction(rosterId: string, orderedItemIds: string[]) {
  await getRepo().reorderRoster(rosterId, orderedItemIds);
  revalidateWorkspace();
}

export async function copyCandidatesAction(candidateIds: string[], targetClientId: string) {
  const count = await getRepo().copyCandidatesToClient(candidateIds, targetClientId);
  revalidateWorkspace();
  return count;
}

export async function shareRosterAction(rosterId: string) {
  await getRepo().shareRoster(rosterId);
  revalidateWorkspace();
}

export async function createClientAction(name: string) {
  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const id = await repo.createClient(agencyId, name.trim());
  revalidateWorkspace();
  redirect(`/app/clients/${id}`);
}

export async function renameClientAction(id: string, name: string) {
  await getRepo().renameClient(id, name.trim());
  revalidateWorkspace();
}

export async function deleteClientAction(id: string) {
  await getRepo().deleteClient(id);
  revalidateWorkspace();
  redirect("/app");
}

export async function addCityAction(clientId: string, label: string) {
  await getRepo().addCity(clientId, label.trim());
  revalidateWorkspace();
}

export async function renameCityAction(id: string, label: string) {
  await getRepo().renameCity(id, label.trim());
  revalidateWorkspace();
}

export async function deleteCityAction(id: string) {
  await getRepo().deleteCity(id);
  revalidateWorkspace();
}

export async function setFeedbackAction(
  rosterItemId: string,
  patch: { reaction?: ReactionKey | null; note?: string },
) {
  await getRepo().setFeedback(rosterItemId, patch);
  revalidatePath("/portal", "layout");
  revalidateWorkspace();
}

// --- debrief (ADR-007) ------------------------------------------------------
//
// Two entry points rather than one parameterised action, so a portal request
// has no way to express "write the candidate's account". The voice, the author
// and the provenance are fixed by which door you came through.

export async function logIntroductionAction(rosterItemId: string) {
  const id = await getRepo().logIntroduction(rosterItemId, null);
  revalidateWorkspace();
  revalidatePath("/portal", "layout");
  return id;
}

/** The client's own account, written by the client, in their portal. */
export async function saveClientDebriefAction(
  introductionId: string,
  patch: { disposition?: DispositionKey | null; body?: string },
) {
  await getRepo().saveDebrief({
    introductionId,
    voice: "client",
    authorKind: "client",
    provenance: "stated",
    ...patch,
  });
  revalidatePath("/portal", "layout");
  revalidateWorkspace();
}

/**
 * The matchmaker writing up either the candidate's account — which reaches them
 * second-hand, hence `relayed` — or their own read of the pairing.
 */
export async function saveInternalDebriefAction(
  introductionId: string,
  voice: "candidate" | "self",
  patch: { disposition?: DispositionKey | null; body?: string },
) {
  await getRepo().saveDebrief({
    introductionId,
    voice,
    authorKind: "matchmaker",
    provenance: voice === "candidate" ? "relayed" : "inferred",
    ...patch,
  });
  revalidateWorkspace();
}

export async function updateBrandAction(agencyId: string, brand: Brand) {
  await getRepo().updateBrand(agencyId, brand);
  revalidatePath("/", "layout");
}

export async function createBookingAction(input: Omit<Booking, "id">) {
  const id = await getRepo().createBooking(input);
  revalidateWorkspace();
  return id;
}

export async function updateBookingAction(id: string, patch: Partial<Booking>) {
  await getRepo().updateBooking(id, patch);
  revalidateWorkspace();
}

export async function setNetworkListingAction(
  candidateId: string,
  listing: {
    listed: boolean; consentVersion?: string; metro?: string;
    professionCategory?: string; headline?: string; relocationOpen?: boolean;
  },
) {
  await getRepo().setNetworkListing(candidateId, listing);
  revalidateWorkspace();
}

export async function createReferralRequestAction(input: {
  networkProfileId: string; clientBrief: string; message: string;
}) {
  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const id = await repo.createReferralRequest({ ...input, requestingAgencyId: agencyId });
  revalidateWorkspace();
  return id;
}

export async function respondToReferralAction(id: string, decision: "released" | "declined") {
  await getRepo().respondToReferral(id, decision);
  revalidateWorkspace();
}
