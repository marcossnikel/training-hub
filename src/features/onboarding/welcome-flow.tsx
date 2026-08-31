"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
} from "lucide-react";
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
  const previousStep = useRef(step);
  const moment: Moment = MOMENTS[step - 1] ?? "evidence";
  const copy = t[moment];
  const direction = step >= previousStep.current ? 1 : -1;

  useEffect(() => heading.current?.focus(), [step]);
  useEffect(() => {
    previousStep.current = step;
  }, [step]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <motion.main
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.32 } },
      }}
      className="th-foundation fixed inset-0 z-[100] min-h-svh overflow-hidden bg-black/35 backdrop-blur-xl dark:bg-black/55"
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(182,83,42,0.22),transparent_32%),radial-gradient(circle_at_86%_92%,rgba(35,72,58,0.18),transparent_38%)]"
      />
      <div className="relative flex min-h-svh w-full items-stretch">
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.08, duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-svh w-full"
        >
          <section
            aria-labelledby="welcome-heading"
            aria-modal="true"
            className="relative grid min-h-svh w-full overflow-hidden border border-white/10 bg-card/95 shadow-[0_24px_80px_rgba(23,24,21,0.24)] md:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)] dark:border-white/10 dark:bg-[#171916]/95 dark:shadow-black/50"
            role="dialog"
          >
            <aside className="hidden flex-col justify-between bg-[#1f3029] p-7 text-[#f6f3ea] md:flex lg:p-9">
              <div>
                <div className="flex items-center gap-2 font-mono text-[0.65rem] font-medium tracking-[0.16em] uppercase opacity-80">
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#d5e4d8]/15">
                    <ShieldCheckIcon className="size-3.5" aria-hidden />
                  </span>
                  {t.eyebrow}
                </div>
                <p className="mt-16 max-w-[15rem] text-3xl leading-tight font-medium tracking-[-0.03em]">
                  {t.takeoverTitle}
                </p>
                <p className="mt-4 max-w-[15rem] text-sm leading-6 text-[#d5e4d8]/70">
                  {t.takeoverBody}
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex gap-1.5" aria-label={`${step} of ${MOMENTS.length} steps`}>
                  {MOMENTS.map((item, index) => (
                    <span
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                        index < step ? "bg-[#e8b18f]" : "bg-[#d5e4d8]/20"
                      }`}
                      key={item}
                    />
                  ))}
                </div>
                <p className="font-mono text-[0.65rem] tracking-wide text-[#d5e4d8]/60 uppercase">
                  {t.workspaceLabel} · {step}/{MOMENTS.length}
                </p>
              </div>
            </aside>

            <div className="flex min-h-0 flex-col p-5 sm:p-8 lg:p-10">
              <header className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
                    <ShieldCheckIcon className="size-4" aria-hidden />
                  </span>
                  <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground">
                    {t.eyebrow} · {step}/{MOMENTS.length}
                  </p>
                </div>
                <form action={skipWelcomeAction}>
                  <Button variant="ghost" type="submit" className="-mr-2 rounded-full px-3">
                    {t.skip}
                  </Button>
                </form>
              </header>

              <div className="mt-4 flex gap-1.5 md:hidden" aria-hidden="true">
                {MOMENTS.map((item, index) => (
                  <span
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                      index < step ? "bg-primary" : "bg-muted"
                    }`}
                    key={item}
                  />
                ))}
              </div>

              <div className="relative min-h-0 flex-1 overflow-y-auto py-8 sm:py-12">
                <AnimatePresence initial={false} mode="wait" custom={direction}>
                  <motion.section
                    key={step}
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={{
                      enter: (travel: number) => ({
                        opacity: 0,
                        x: travel * 28,
                        filter: "blur(4px)",
                      }),
                      center: { opacity: 1, x: 0, filter: "blur(0px)" },
                      exit: (travel: number) => ({
                        opacity: 0,
                        x: travel * -28,
                        filter: "blur(4px)",
                      }),
                    }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="max-w-xl"
                    aria-live="polite"
                  >
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
                    {moment !== "choice" ? (
                      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckIcon className="size-4 text-positive" aria-hidden />
                        {t.notRequired}
                      </div>
                    ) : null}
                  </motion.section>
                </AnimatePresence>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                {step > 1 ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`/onboarding/welcome?step=${step - 1}`}>
                      <ArrowLeftIcon aria-hidden />
                      {t.back}
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
                {moment !== "choice" ? (
                  <Button asChild className="rounded-full px-5">
                    <Link href={`/onboarding/welcome?step=${step + 1}`}>
                      {t.next}
                      <ArrowRightIcon aria-hidden />
                    </Link>
                  </Button>
                ) : (
                  <div className="flex flex-wrap justify-end gap-3">
                    <form action={completeWelcomeAction}>
                      <Button variant="outline" type="submit" className="rounded-full">
                        {t.explore}
                      </Button>
                    </form>
                    <form action={completeWelcomeToSettingsAction}>
                      <Button type="submit" className="rounded-full px-5">
                        {t.connect}
                        <ExternalLinkIcon aria-hidden />
                      </Button>
                    </form>
                  </div>
                )}
              </footer>
            </div>
          </section>
        </motion.div>
      </div>
    </motion.main>
  );
}
