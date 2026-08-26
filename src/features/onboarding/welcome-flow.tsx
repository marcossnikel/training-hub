"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n";
import {
  completeWelcomeAction,
  completeWelcomeToSettingsAction,
  skipWelcomeAction,
} from "./actions";

const MOMENTS = ["evidence", "surfaces", "boundary", "choice"] as const;
type Moment = (typeof MOMENTS)[number];

export function WelcomeFlow({ step, t }: { step: number; t: Dict["onboarding"] }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const moment: Moment = MOMENTS[step - 1] ?? "evidence";
  const copy = t[moment];

  useEffect(() => heading.current?.focus(), [step]);

  return (
    <main className="th-foundation min-h-svh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-2xl flex-col rounded-2xl border bg-card p-6 sm:min-h-[calc(100svh-4rem)] sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground">
            {t.eyebrow} · {step}/{MOMENTS.length}
          </p>
          <form action={skipWelcomeAction}>
            <Button variant="ghost" type="submit">
              {t.skip}
            </Button>
          </form>
        </div>

        <section className="my-auto max-w-xl py-12 sm:py-16" aria-labelledby="welcome-heading">
          <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground">
            {copy.label}
          </p>
          <h1
            ref={heading}
            id="welcome-heading"
            tabIndex={-1}
            className="focus-ring mt-5 rounded-sm text-4xl leading-[1.04] font-semibold tracking-[-0.04em] outline-none sm:text-5xl"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            {copy.body}
          </p>
          {moment === "boundary" ? (
            <p className="mt-6 rounded-xl border bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
              {t.boundaryNote}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          {step > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/onboarding/welcome?step=${step - 1}`}>
                <ArrowLeftIcon aria-hidden />
                {t.back}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {moment !== "choice" ? (
            <Button asChild>
              <Link href={`/onboarding/welcome?step=${step + 1}`}>
                {t.next}
                <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <form action={completeWelcomeAction}>
                <Button variant="outline" type="submit">
                  {t.explore}
                </Button>
              </form>
              <form action={completeWelcomeToSettingsAction}>
                <Button type="submit">
                  {t.connect}
                  <ExternalLinkIcon aria-hidden />
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
