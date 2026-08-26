import "server-only";

import { createHash } from "node:crypto";
import { getAthletePerformanceProfile } from "@/lib/db/athlete-parameters";
import { many } from "@/lib/db/helpers";
import type { OwnerContext } from "@/lib/owner-context";
import { theoryCardsFor } from "../theory-catalog";
import {
  TRAINING_ANALYST_PACKET_VERSION,
  type TrainingAnalystEvidencePacketV1,
  type TrainingAnalystEvidence,
} from "../types";

type ActivityRow = {
  started_at: string | null;
  started_at_local: string | null;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
};

function day(stamp: string | null): string | null {
  const value = stamp?.slice(0, 10);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function finite(value: number | null, decimals = 0): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function activityValues(row: ActivityRow): Record<string, number> {
  return Object.fromEntries(
    [
      ["distance_km", finite(row.distance_km, 2)],
      ["moving_time_s", finite(row.moving_time_s)],
      ["elevation_m", finite(row.elevation_gain_m)],
      ["average_hr_bpm", finite(row.avg_hr)],
    ].filter((pair): pair is [string, number] => pair[1] !== null)
  );
}

function sportOf(rows: ActivityRow[]): "run" | "ride" | "mixed" {
  const sports = new Set(rows.map((row) => row.sport_type?.toLowerCase()).filter(Boolean));
  const hasRun = [...sports].some((sport) => sport?.includes("run"));
  const hasRide = [...sports].some((sport) => sport?.includes("ride") || sport?.includes("cycl"));
  return hasRun && hasRide ? "mixed" : hasRide ? "ride" : "run";
}

export type PacketBuildResult =
  | { kind: "ready"; packet: TrainingAnalystEvidencePacketV1; digest: string }
  | { kind: "insufficient_evidence"; limitation: string };

/** Builds a field-minimized, owner-scoped packet. This query intentionally never selects activity text or provider IDs. */
export async function buildTrainingAnalystPacket(
  owner: OwnerContext,
  now = new Date()
): Promise<PacketBuildResult> {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 90);
  const rows = await many<ActivityRow>(
    `SELECT started_at, started_at_local, sport_type, distance_km, moving_time_s, elevation_gain_m, avg_hr
       FROM activities
      WHERE user_id = ? AND status = 'confirmed' AND started_at >= ?
      ORDER BY started_at DESC LIMIT 12`,
    [owner.userId, since.toISOString()]
  );
  const profile = await getAthletePerformanceProfile(owner);
  const evidence: TrainingAnalystEvidence[] = rows.flatMap((row, index) => {
    const observedAt = day(row.started_at_local ?? row.started_at);
    const values = activityValues(row);
    return observedAt && Object.keys(values).length > 0
      ? [
          {
            id: `E${index + 1}` as const,
            kind: "activity_summary" as const,
            observedAt,
            values,
            limitation:
              "Only confirmed activity summary values are available; intensity and session context are not included.",
          },
        ]
      : [];
  });
  if (evidence.length < 2) {
    return {
      kind: "insufficient_evidence",
      limitation: "Fewer than two valid confirmed activity summaries are available.",
    };
  }
  const sport = sportOf(rows);
  const theoryCards = theoryCardsFor(sport);
  if (theoryCards.length === 0)
    return {
      kind: "insufficient_evidence",
      limitation: "No relevant reviewed theory card is available.",
    };
  const timezone = profile.timezone.value;
  const asOfDate = now.toISOString().slice(0, 10);
  const parameters = Object.values(profile.parameters).flatMap((parameter) => {
    if (
      parameter.value === null ||
      parameter.provenance === null ||
      parameter.provenance === "analyst_hypothesis" ||
      !["bpm", "s/km", "W", "ml/kg/min"].includes(parameter.unit)
    )
      return [];
    return [
      {
        key: parameter.key,
        value: parameter.value,
        unit: parameter.unit as "bpm" | "s/km" | "W" | "ml/kg/min",
        provenance: parameter.provenance,
        observedAt: parameter.observedAt?.slice(0, 10) ?? null,
      },
    ];
  });
  const packet: TrainingAnalystEvidencePacketV1 = {
    schemaVersion: TRAINING_ANALYST_PACKET_VERSION,
    packetId: crypto.randomUUID(),
    asOfDate,
    window: { startDate: since.toISOString().slice(0, 10), endDate: asOfDate, timezone },
    sport,
    dataQuality: [timezone ? "complete" : "missing_timezone"],
    athleteContext: {
      runningTrainingAge: "unknown",
      performanceParameters: parameters.slice(0, 6),
    },
    evidence: evidence.slice(0, 24),
    theoryCards,
  };
  const serialized = JSON.stringify(packet);
  if (new TextEncoder().encode(serialized).byteLength > 20_000) {
    return {
      kind: "insufficient_evidence",
      limitation: "The selected evidence exceeds the bounded analyst packet.",
    };
  }
  return { kind: "ready", packet, digest: createHash("sha256").update(serialized).digest("hex") };
}
