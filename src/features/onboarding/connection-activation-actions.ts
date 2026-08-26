"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { completeConnectionActivation, dismissConnectionActivation } from "@/lib/db";

export async function dismissConnectionActivationAction(): Promise<void> {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  await dismissConnectionActivation(owner);
  redirect("/");
}

export async function completeConnectionActivationAction(): Promise<void> {
  const owner = await requireCurrentUser();
  if (!owner) return;
  await completeConnectionActivation(owner);
}
