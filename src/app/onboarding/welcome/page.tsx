import { redirect } from "next/navigation";
import { WelcomeFlow } from "@/features/onboarding/welcome-flow";
import { needsWelcomeOnboarding } from "@/features/onboarding/welcome";
import { requireCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: PageProps<"/onboarding/welcome">) {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  if (!(await needsWelcomeOnboarding(owner))) redirect("/");
  const raw = (await searchParams).step;
  const step = typeof raw === "string" && /^(1|2|3|4)$/.test(raw) ? Number(raw) : 1;
  const { t } = await getDict();
  return <WelcomeFlow step={step} t={t.onboarding} />;
}
