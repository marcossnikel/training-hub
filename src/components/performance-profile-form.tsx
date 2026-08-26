"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyProfileCandidateAction,
  clearProfileParameterAction,
  clearProfileTimezoneAction,
  saveProfileParameterAction,
  saveProfileTimezoneAction,
} from "@/features/profile/server/actions";
import type {
  AthleteParameterKey,
  AthleteParameterObservation,
  AthletePerformanceProfile,
} from "@/lib/db";

const FIELDS: readonly {
  key: AthleteParameterKey;
  label: string;
  help: string;
  inputMode?: "decimal" | "numeric";
}[] = [
  {
    key: "resting_hr_bpm",
    label: "Resting heart rate",
    help: "Used only when a calculation explicitly needs it.",
    inputMode: "numeric",
  },
  {
    key: "max_hr_bpm",
    label: "Maximum heart rate",
    help: "Optional reference value.",
    inputMode: "numeric",
  },
  {
    key: "lthr_bpm",
    label: "Lactate threshold heart rate",
    help: "Enables heart-rate zones.",
    inputMode: "numeric",
  },
  {
    key: "threshold_pace_sec_per_km",
    label: "Threshold pace",
    help: "Enables pace zones. Enter seconds per kilometre.",
    inputMode: "numeric",
  },
  {
    key: "cycling_ftp_watts",
    label: "Cycling FTP",
    help: "Enables power zones for rides with power data.",
    inputMode: "numeric",
  },
  {
    key: "measured_vo2max_ml_kg_min",
    label: "Measured VO2max",
    help: "Optional measured observation; no estimate is substituted.",
    inputMode: "decimal",
  },
];

function sourceLabel(provenance: AthleteParameterObservation["provenance"] | null): string {
  if (provenance === "athlete_entered") return "Athlete entered";
  if (provenance === "provider") return "Provider candidate";
  if (provenance === "calculated") return "Calculated candidate";
  if (provenance === "analyst_hypothesis") return "Analyst hypothesis";
  return "Unknown";
}

export function PerformanceProfileForm({
  profile,
  candidates,
}: {
  profile: AthletePerformanceProfile;
  candidates: Partial<Record<AthleteParameterKey, AthleteParameterObservation[]>>;
}) {
  const [values, setValues] = useState<Record<AthleteParameterKey, string>>(
    Object.fromEntries(
      FIELDS.map(({ key }) => [key, profile.parameters[key].value?.toString() ?? ""])
    ) as Record<AthleteParameterKey, string>
  );
  const [timezone, setTimezone] = useState(profile.timezone.value ?? "");
  const [pending, startTransition] = useTransition();

  function saveField(key: AthleteParameterKey) {
    const value = Number(values[key]);
    startTransition(async () => {
      const result = await saveProfileParameterAction({ key, value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile value saved");
    });
  }

  function clearField(key: AthleteParameterKey) {
    startTransition(async () => {
      const result = await clearProfileParameterAction(key);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setValues((current) => ({ ...current, [key]: "" }));
      toast.success("Profile value cleared. It remains unknown.");
    });
  }

  function applyCandidate(candidateId: string) {
    startTransition(async () => {
      const result = await applyProfileCandidateAction(candidateId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Candidate confirmed as your value");
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
        Every field is optional. Missing values stay unknown; Training Hub does not fill them with
        defaults. Saving a value marks it as athlete-entered and replaces only that field.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, help, inputMode }) => {
          const parameter = profile.parameters[key];
          return (
            <section key={key} className="rounded-xl border p-4">
              <Label htmlFor={`profile-${key}`}>{label}</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>
              <div className="mt-3 flex gap-2">
                <Input
                  id={`profile-${key}`}
                  type="number"
                  inputMode={inputMode}
                  value={values[key]}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [key]: event.target.value }))
                  }
                  placeholder={parameter.suppressed ? "Unknown" : undefined}
                  aria-describedby={`profile-${key}-source`}
                  className="font-mono tabular-nums"
                />
                <Button
                  type="button"
                  disabled={pending || !values[key]}
                  onClick={() => saveField(key)}
                >
                  Save
                </Button>
              </div>
              <div
                id={`profile-${key}-source`}
                className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <span>
                  {parameter.value === null
                    ? parameter.suppressed
                      ? "Explicitly unknown"
                      : "Unknown"
                    : `${sourceLabel(parameter.provenance)} · ${parameter.unit}`}
                </span>
                {parameter.value !== null || parameter.suppressed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => clearField(key)}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              {(candidates[key] ?? []).map((candidate) => (
                <div
                  key={candidate.id}
                  className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"
                >
                  <p>
                    {candidate.value} {candidate.unit} · {sourceLabel(candidate.provenance)}
                    {candidate.observedAt
                      ? ` · observed ${new Date(candidate.observedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  {candidate.calculationVersion ? (
                    <p>Version {candidate.calculationVersion}</p>
                  ) : null}
                  {candidate.evidenceRef ? <p>Evidence: {candidate.evidenceRef}</p> : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={pending}
                    onClick={() => applyCandidate(candidate.id)}
                  >
                    Use as my value
                  </Button>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border p-4">
        <Label htmlFor="profile-timezone">Effective timezone</Label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Use a complete IANA name, for example America/Sao_Paulo. A UTC offset cannot describe
          daylight-saving rules.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            id="profile-timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="America/Sao_Paulo"
            className="font-mono text-sm"
          />
          <Button
            type="button"
            disabled={pending || !timezone}
            onClick={() =>
              startTransition(async () => {
                const result = await saveProfileTimezoneAction(timezone);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Timezone saved");
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
            Save
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {profile.timezone.value
            ? `${profile.timezone.value} · ${sourceLabel(profile.timezone.provenance)}`
            : "Unknown — relative calendar labels stay unavailable."}
        </p>
        {profile.timezone.provenance === "athlete_entered" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await clearProfileTimezoneAction();
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setTimezone("");
                toast.success("Timezone override cleared");
              })
            }
          >
            Clear athlete override
          </Button>
        ) : null}
      </section>
    </div>
  );
}
