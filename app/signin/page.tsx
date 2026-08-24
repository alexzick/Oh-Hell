import { redirect } from "next/navigation";
import { authEnabled, currentViewer } from "@/lib/auth";
import { SignInForm } from "@/components/signin-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!authEnabled) redirect("/app");
  const { next, error } = await searchParams;

  const viewer = await currentViewer();
  if (viewer?.member) redirect("/app");
  if (viewer?.client) redirect(`/portal/${viewer.client.id}`);

  return <SignInForm next={next} error={error} signedInButUnknown={Boolean(viewer)} />;
}
