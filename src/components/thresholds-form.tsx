"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { saveThresholdsAction } from "@/lib/actions";
import { fmtPaceShort, parsePace } from "@/lib/format";
import { parseFiniteNumber } from "@/lib/validate";
import type { AthleteThresholds } from "@/lib/fitness";

export function ThresholdsForm({ thresholds }: { thresholds: AthleteThresholds }) {
  const { t } = useI18n();
  const [maxHr, setMaxHr] = useState(String(thresholds.maxHr));
  const [restingHr, setRestingHr] = useState(String(thresholds.restingHr));
  const [lthr, setLthr] = useState(String(thresholds.lthr));
  const [pace, setPace] = useState(fmtPaceShort(thresholds.thresholdPaceSPerKm));
  const [ftp, setFtp] = useState(String(thresholds.ftpW));
  const [restingEstimated, setRestingEstimated] = useState(thresholds.restingHrEstimated);
  const [ftpProvisional, setFtpProvisional] = useState(thresholds.ftpProvisional);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const paceSPerKm = parsePace(pace);
    if (!paceSPerKm) {
      toast.error(`${t.fitness.thresholds.thresholdPace}: mm:ss`);
      return;
    }
    // Reject blank/non-numeric fields before posting so NaN never reaches the
    // save action (G6.4). The server re-validates ranges as the trust boundary.
    const maxHrValue = parseFiniteNumber(maxHr);
    const restingHrValue = parseFiniteNumber(restingHr);
    const lthrValue = parseFiniteNumber(lthr);
    const ftpValue = parseFiniteNumber(ftp);
    if (maxHrValue === null || restingHrValue === null || lthrValue === null || ftpValue === null) {
      toast.error(t.errors.invalidThresholds);
      return;
    }
    startTransition(async () => {
      const result = await saveThresholdsAction({
        maxHr: maxHrValue,
        restingHr: restingHrValue,
        lthr: lthrValue,
        thresholdPaceSPerKm: paceSPerKm,
        ftpW: ftpValue,
        restingHrEstimated: restingEstimated,
        ftpProvisional: ftpProvisional,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.fitness.thresholds.saved);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="th-maxhr">{t.fitness.thresholds.maxHr}</Label>
          <Input
            id="th-maxhr"
            type="number"
            inputMode="numeric"
            value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="th-lthr">{t.fitness.thresholds.lthr}</Label>
          <Input
            id="th-lthr"
            type="number"
            inputMode="numeric"
            value={lthr}
            onChange={(e) => setLthr(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="th-pace">{t.fitness.thresholds.thresholdPace}</Label>
          <Input
            id="th-pace"
            value={pace}
            onChange={(e) => setPace(e.target.value)}
            placeholder="mm:ss"
            inputMode="numeric"
            className="font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="th-resting">{t.fitness.thresholds.restingHr}</Label>
          <Input
            id="th-resting"
            type="number"
            inputMode="numeric"
            value={restingHr}
            onChange={(e) => setRestingHr(e.target.value)}
            className="font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">{t.fitness.thresholds.restingNote}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="th-ftp">{t.fitness.thresholds.ftp}</Label>
          <Input
            id="th-ftp"
            type="number"
            inputMode="numeric"
            value={ftp}
            onChange={(e) => setFtp(e.target.value)}
            className="font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">{t.fitness.thresholds.ftpNote}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={restingEstimated}
            onChange={(e) => setRestingEstimated(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t.fitness.thresholds.restingEstimated}
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={ftpProvisional}
            onChange={(e) => setFtpProvisional(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t.fitness.thresholds.ftpProvisional}
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
        {t.fitness.thresholds.save}
      </Button>
    </form>
  );
}
