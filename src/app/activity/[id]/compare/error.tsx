"use client";

import { useI18n } from "@/components/i18n-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ComparableActivityError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useI18n();
  const copy = t.comparableActivity;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Alert variant="destructive">
        <AlertTitle>
          <h1 className="font-display text-xl font-semibold">{copy.errorTitle}</h1>
        </AlertTitle>
        <AlertDescription>{copy.errorBody}</AlertDescription>
      </Alert>
      <Button className="mt-4" onClick={unstable_retry}>
        {copy.retry}
      </Button>
    </div>
  );
}
