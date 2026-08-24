import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { PortalProfile } from "@/components/portal-profile";

export default async function PortalProfilePage({
  params,
}: {
  params: Promise<{ clientId: string; itemId: string }>;
}) {
  const { clientId, itemId } = await params;
  const repo = getRepo();
  const view = await repo.loadPortal(clientId);
  if (!view) notFound();

  const item = view.items.find((i) => i.id === itemId);
  if (!item) notFound();

  const ws = await repo.loadWorkspace(view.agency.id);

  return (
    <PortalProfile
      clientId={clientId}
      clientName={view.client.name}
      item={item}
      confidentialityNote={ws.agency.brand.confidentialityNote}
    />
  );
}
