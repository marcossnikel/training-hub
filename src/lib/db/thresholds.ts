// The athlete's reference thresholds (max HR, resting HR, LTHR, threshold pace,
// FTP). Split out of the old load.ts when training load was removed: the zones
// and performance page both still need these.
import { getAthletePerformanceProfile } from "./athlete-parameters";
import type { AthleteThresholds } from "../fitness";
import type { OwnerContext } from "../owner-context";

export async function getAthleteThresholds(owner: OwnerContext): Promise<AthleteThresholds> {
  const profile = await getAthletePerformanceProfile(owner);
  const updated = Object.values(profile.parameters)
    .map((parameter) => parameter.updatedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  return {
    maxHr: profile.parameters.max_hr_bpm.value,
    restingHr: profile.parameters.resting_hr_bpm.value,
    lthr: profile.parameters.lthr_bpm.value,
    thresholdPaceSPerKm: profile.parameters.threshold_pace_sec_per_km.value,
    ftpW: profile.parameters.cycling_ftp_watts.value,
    // These old display flags described founder placeholders. They remain only
    // for compatibility with existing presentation call sites and are never set.
    restingHrEstimated: false,
    ftpProvisional: false,
    updatedAt: updated ?? null,
  };
}
