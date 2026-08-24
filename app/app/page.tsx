import { redirect } from "next/navigation";
import { getRepo } from "@/lib/db";

export default async function AppIndex() {
  const repo = getRepo();
  const ws = await repo.loadWorkspace(await repo.defaultAgencyId());
  const first = ws.clients[0];
  if (!first) redirect("/app/settings");
  redirect(`/app/clients/${first.id}`);
}
