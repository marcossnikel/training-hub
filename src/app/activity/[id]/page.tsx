import { notFound } from "next/navigation";
import {
  ActivityDetailPage,
  generateActivityMetadata,
} from "@/features/activities/detail/activity-detail-page";

export async function generateMetadata({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  return generateActivityMetadata(id);
}

/** App Router composition only; feature loading and presentation stay activity-owned. */
export default async function Page({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id))) notFound();
  return <ActivityDetailPage id={id} />;
}
