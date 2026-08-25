"use server";

import { fail } from "@/lib/action-result";
import { dict, refreshAll } from "@/lib/action-helpers";
import { requireCurrentUser } from "@/lib/auth";
import { isStravaConnected } from "./connection";
import { syncStravaActivities, type SyncResult } from "./sync";

export type SyncActionResult = ({ ok: true } & SyncResult) | { ok: false; error: string };

export async function syncNowAction(): Promise<SyncActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  if (!(await isStravaConnected(owner))) return { ok: false, error: t.errors.notConnected };
  try {
    const result = await syncStravaActivities(owner);
    refreshAll();
    return { ok: true, ...result };
  } catch (error) {
    return fail(error, t.errors.syncFailed);
  }
}
