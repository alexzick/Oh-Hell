import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { CandidateEditor } from "@/components/candidate-editor";
import { summarise } from "@/lib/types";

export default async function CandidateEditorPage({
  params,
}: {
  params: Promise<{ clientId: string; itemId: string }>;
}) {
  const { clientId, itemId } = await params;
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());

  const item = ws.items.find((i) => i.id === itemId);
  const client = ws.clients.find((c) => c.id === clientId);
  if (!item || !client) notFound();

  const candidate = ws.candidates.find((c) => c.id === item.candidateId);
  if (!candidate) notFound();

  const internal = ws.internal[candidate.id] ?? { ig: "", source: "", notes: "" };
  const feedback = ws.feedback[item.id] ?? null;
  const introduction = ws.introductions.find((i) => i.rosterItemId === item.id) ?? null;
  const outcome = introduction ? summarise(introduction.id, ws.debriefs) : null;

  return (
    <CandidateEditor
      clientId={clientId}
      clientName={client.name}
      item={item}
      candidate={candidate}
      ig={internal.ig}
      source={internal.source}
      feedback={feedback}
      cities={ws.cities.filter((c) => c.clientId === clientId)}
      introductionId={introduction?.id ?? null}
      outcome={outcome}
    />
  );
}
