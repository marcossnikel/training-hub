import type { SplitError } from "./i18n";
import type { SplitInput } from "./types";

export function isRunSport(sport: string | null | undefined): boolean {
  return (sport ?? "").toLowerCase().includes("run");
}

/**
 * Parses a form/id value into a positive integer row id, or null when the value
 * is not a usable id (non-numeric, NaN, non-integer, or non-positive).
 *
 * G6.4: the previous inline coercion `Number(idRaw)` produced NaN for a
 * non-numeric id, and because NaN is falsy the update-vs-create branch silently
 * routed an UPDATE into a CREATE (a stray row). parseId returns null for every
 * non-id value — never NaN, never a silent 0 — so callers can reject an invalid
 * id explicitly. Callers must still distinguish an ABSENT id (blank, meaning
 * "create") from a PRESENT-but-invalid one (which is an error).
 */
export function parseId(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const n = typeof raw === "number" ? raw : Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parses a numeric form field into a finite number, or null when the field is
 * blank or not a number.
 *
 * G6.4: the former thresholds form coerced each field with `Number(...)`, so a blank field
 * became 0 and a garbage field became NaN, either of which was posted to the
 * save action. This returns null for both so the form can stop before posting.
 */
export function parseFiniteNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function sumSplits(splits: SplitInput[]): number {
  return splits.reduce((acc, s) => acc + (Number.isFinite(s.km) ? s.km : 0), 0);
}

/**
 * Shared split validation for the review queue and the activity detail editor.
 * Returns a language-neutral error code (render it with splitErrorText), or
 * null when the splits are valid.
 *
 * Rules:
 * - Every split needs a shoe and a distance greater than zero.
 * - Runs must be fully covered: split kms must add up to the activity distance.
 * - Non-run activities may have no splits at all; if they do have splits,
 *   the total cannot exceed the activity distance.
 */
export function validateSplits(
  activity: { distance_km: number | null; sport_type: string | null },
  splits: SplitInput[]
): SplitError | null {
  const run = isRunSport(activity.sport_type);
  const dist = activity.distance_km ?? 0;

  if (splits.length === 0) {
    if (run && dist > 0.05) return { code: "assignRun" };
    return null;
  }

  for (const s of splits) {
    if (s.shoe_id == null) return { code: "needShoe" };
    if (!Number.isFinite(s.km) || s.km <= 0) return { code: "positiveKm" };
  }

  if (dist > 0) {
    const total = sumSplits(splits);
    if (run && Math.abs(total - dist) > 0.05) {
      const remaining = Math.round((dist - total) * 100) / 100;
      return remaining > 0
        ? { code: "underBy", km: remaining.toFixed(2) }
        : { code: "overBy", km: Math.abs(remaining).toFixed(2) };
    }
    if (!run && total - dist > 0.05) return { code: "exceedDistance" };
  }

  return null;
}
