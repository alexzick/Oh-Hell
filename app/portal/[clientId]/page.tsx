import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { PortalRoster } from "@/components/portal-roster";

export default async function PortalRosterPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const view = await getRepo().loadPortal(clientId);
  if (!view) notFound();

  return (
    <PortalRoster
      clientId={clientId}
      clientName={view.client.name}
      cities={view.cities}
      items={view.items}
    />
  );
}
