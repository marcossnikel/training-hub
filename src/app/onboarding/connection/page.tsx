import { redirect } from "next/navigation";
import { ConnectionActivationFlow } from "@/features/onboarding/connection-activation-flow";
import { prepareConnectionActivationSummary } from "@/features/onboarding/connection-activation";
import { getConnectionActivation, getInitialStravaImportStatus } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Connection activation" };
export const dynamic = "force-dynamic";

export default async function ConnectionActivationPage() {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const [activation, status, { lang }] = await Promise.all([
    getConnectionActivation(owner),
    getInitialStravaImportStatus(owner),
    getDict(),
  ]);
  if (!activation || !status) redirect("/settings");
  const summary =
    activation.state === "completed" ||
    activation.state === "summary_ready" ||
    status.job.status === "completed"
      ? await prepareConnectionActivationSummary(owner)
      : null;
  return <ConnectionActivationFlow status={status} summary={summary} lang={lang} />;
}
