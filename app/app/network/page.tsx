import { getRepo } from "@/lib/db";
import { NetworkView } from "@/components/network-view";

export default async function NetworkPage() {
  const repo = getRepo();
  const agencyId = await repo.defaultAgencyId();
  const [ws, results, referrals] = await Promise.all([
    repo.loadWorkspace(agencyId),
    repo.searchNetwork(agencyId, {}),
    repo.listReferrals(agencyId),
  ]);

  // What other agencies would see of our own listings — shown back to us so the
  // anonymization is inspectable rather than a promise.
  const ourListings = ws.candidates
    .filter((c) => c.networkListed)
    .map((c) => ({
      candidateId: c.id,
      name: c.name,
      ageBand: bandFor(c.age),
      metro: c.basedIn,
      professionCategory: c.profession,
      faith: c.faith,
    }));

  return (
    <NetworkView
      agencyName={ws.agency.name}
      ourListings={ourListings}
      results={results}
      incoming={referrals.incoming}
      outgoing={referrals.outgoing}
      candidateNameFor={Object.fromEntries(ws.candidates.map((c) => [c.id, c.name]))}
    />
  );
}

function bandFor(age: string) {
  const n = Number.parseInt(age, 10);
  if (!Number.isFinite(n)) return "unspecified";
  const lo = Math.floor(n / 5) * 5;
  return `${lo}–${lo + 4}`;
}
