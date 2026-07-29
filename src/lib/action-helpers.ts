// Non-action helpers for the server actions in ./actions. These are plain
// server-side functions (validation, normalization, i18n) deliberately
// kept OUT of the "use server" module so that actions.ts stays the single mutation
// seam: only exported async functions there become server actions, and these
// helpers are called by them rather than exposed as actions themselves.

import { revalidatePath } from "next/cache";
import { dictionaries, type Dict } from "./i18n";
import { getLang } from "./lang";
import type { JournalFields } from "./db";
import type { Feeling, SplitInput } from "./types";

export async function dict(): Promise<Dict> {
  return dictionaries[await getLang()];
}

export function refreshAll() {
  revalidatePath("/", "layout");
}

const FEELINGS: Feeling[] = ["great", "good", "ok", "rough", "terrible"];

export function normalizeJournal(
  input: {
    rpe: number | null;
    feeling: Feeling | null;
    workoutNotes: string;
    healthNotes: string;
  },
  t: Dict
): JournalFields | { error: string } {
  const rpe = input.rpe == null ? null : Math.round(input.rpe);
  if (rpe != null && (rpe < 1 || rpe > 10)) return { error: t.errors.invalidRpe };
  if (input.feeling != null && !FEELINGS.includes(input.feeling)) {
    return { error: t.errors.invalidFeeling };
  }
  return {
    rpe,
    feeling: input.feeling,
    workout_notes: input.workoutNotes.trim() || null,
    health_notes: input.healthNotes.trim() || null,
  };
}

export function normalizeSplits(splits: SplitInput[]): SplitInput[] {
  return splits.map((s) => ({
    shoe_id: s.shoe_id,
    km: Math.round((Number(s.km) || 0) * 100) / 100,
  }));
}

export function inRange(value: number, lo: number, hi: number): boolean {
  return Number.isFinite(value) && value >= lo && value <= hi;
}
