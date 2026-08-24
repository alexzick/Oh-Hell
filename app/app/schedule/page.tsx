import { getRepo } from "@/lib/db";
import { ScheduleView } from "@/components/schedule-view";

export default async function SchedulePage() {
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());

  const clientName = (id: string | null) =>
    ws.clients.find((c) => c.id === id)?.name ?? "—";
  const candidateName = (id: string | null) =>
    ws.candidates.find((c) => c.id === id)?.name ?? null;

  return (
    <ScheduleView
      agencyId={ws.agency.id}
      bookingTypes={ws.bookingTypes}
      clients={ws.clients.map((c) => ({ id: c.id, name: c.name }))}
      members={ws.members.map((m) => ({ id: m.id, name: m.name }))}
      bookings={ws.bookings
        .slice()
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((b) => ({
          ...b,
          clientLabel: clientName(b.clientId),
          candidateLabel: candidateName(b.candidateId),
          typeLabel: ws.bookingTypes.find((t) => t.id === b.bookingTypeId)?.name ?? "Booking",
        }))}
    />
  );
}
