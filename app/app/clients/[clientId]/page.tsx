import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { RosterView } from "@/components/roster-view";

export default async function ClientRosterPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());

  const client = ws.clients.find((c) => c.id === clientId);
  if (!client) notFound();

  const roster = ws.rosters.find((r) => r.clientId === clientId);
  const items = roster ? ws.items.filter((i) => i.rosterId === roster.id) : [];

  const cards = items
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((item) => {
      const candidate = ws.candidates.find((c) => c.id === item.candidateId);
      if (!candidate) return [];
      const feedback = ws.feedback[item.id];
      return [{
        itemId: item.id,
        candidateId: candidate.id,
        name: candidate.name,
        age: candidate.age,
        basedIn: candidate.basedIn,
        photoUrl: candidate.photoUrl,
        photoFrame: candidate.photoFrame,
        cityId: item.cityId,
        status: item.status,
        blurb: item.blurb,
        ig: ws.internal[candidate.id]?.ig ?? "",
        hasFeedback: Boolean(feedback?.reaction || feedback?.note?.trim()),
        reaction: feedback?.reaction ?? null,
      }];
    });

  return (
    <RosterView
      clientId={clientId}
      clientName={client.name}
      rosterId={roster?.id ?? null}
      rosterShared={roster?.status === "shared"}
      cities={ws.cities.filter((c) => c.clientId === clientId)}
      cards={cards}
      otherClients={ws.clients.filter((c) => c.id !== clientId).map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
