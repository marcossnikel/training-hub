const loopSteps = [
  {
    number: "01",
    title: "Bring your own connection",
    body: "Use your own Strava developer app. Credentials are encrypted and never rendered back.",
  },
  {
    number: "02",
    title: "Confirm the record",
    body: "Review the imported facts that determine whether an activity can support evidence.",
  },
  {
    number: "03",
    title: "Open the context",
    body: "See a completed week or comparable session with sources, windows, and limitations.",
  },
] as const;

const faqs = [
  {
    question: "Why my own Strava app?",
    answer:
      "The private beta uses athlete-owned credentials rather than a shared founder connection.",
  },
  {
    question: "What does Training Hub do?",
    answer: "It surfaces evidence-linked patterns across your own confirmed activity history.",
  },
  {
    question: "How should I read an observation?",
    answer:
      "As factual context with a visible method and limit. Your source activities remain the record.",
  },
  {
    question: "How does beta access work?",
    answer:
      "Access is invitation-only. Sign in if you already have an account; a valid invitation carries its own private registration link.",
  },
] as const;

function EvidencePreview() {
  return (
    <aside
      aria-label="Illustrative weekly evidence"
      className="rounded-2xl border bg-muted p-5 sm:p-6"
    >
      <p className="font-mono text-xs text-muted-foreground uppercase">
        A completed week · illustrative example
      </p>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">
        A change worth placing in context.
      </h2>
      <p className="mt-4 text-base font-medium">Easy moving time rose 18%.</p>
      <p className="mt-2 text-base leading-6 text-muted-foreground">
        Three completed weeks are compared with the prior four-week median. Confirmed activities
        only.
      </p>

      <dl className="mt-5 divide-y divide-border/70">
        <div className="flex items-end justify-between gap-4 py-3 first:pt-0">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Moving time</dt>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              03–23 Aug 2026 · prior 4-week median
            </p>
          </div>
          <dd className="text-[1.75rem] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
            +18%
          </dd>
        </div>
        <div className="flex items-end justify-between gap-4 py-3">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Consistency</dt>
            <p className="mt-1 font-mono text-xs text-muted-foreground">weeks with 3+ sessions</p>
          </div>
          <dd className="text-[1.75rem] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
            3 / 4
          </dd>
        </div>
      </dl>

      <p className="mt-4 rounded-lg bg-[var(--th-status-caution-surface)] p-3 text-sm leading-6">
        An observation, not an instruction or score.
      </p>
      <p className="mt-4 font-mono text-xs leading-5 text-muted-foreground">
        Example source: 12 confirmed activities · no heart-rate or stream data
      </p>
    </aside>
  );
}

/** Guest-only root content. It intentionally has no request, data, or tracking work. */
export function PrivateBetaLanding() {
  return (
    <div className="th-foundation bg-background text-foreground">
      <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)] lg:gap-16 lg:px-12 lg:py-20">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground uppercase">
            Private beta · evidence-first training intelligence
          </p>
          <h1 className="font-narrative mt-6 text-[3.25rem] leading-[1.02] font-normal tracking-[-0.035em] text-balance sm:text-6xl sm:leading-[1.02]">
            See the part of your training history you cannot see alone.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            Training Hub places evidence-linked patterns across your confirmed activity history
            beside their sources, dates, windows, metrics, and limits.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#beta-access"
              className="focus-ring inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none"
            >
              How beta access works
            </a>
            <a
              href="/login"
              className="focus-ring hidden min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none sm:inline-flex"
            >
              Sign in
            </a>
          </div>
          <p className="mt-6 max-w-xl font-mono text-xs leading-5 text-muted-foreground">
            Private beta uses your own Strava developer app. It does not resolve Strava platform or
            commercial-policy requirements.
          </p>
        </div>

        <EvidencePreview />
      </section>

      <section className="bg-muted">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-6 py-8 sm:grid-cols-[18rem_minmax(0,1fr)] sm:gap-10 lg:px-12">
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">
            More than a log.
            <br />
            Still your decision.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            The product earns attention by showing a small number of explainable patterns: a changed
            week, a comparable prior session, or a gap in the record that changes how to read it.
          </p>
        </div>
      </section>

      <section
        id="beta-access"
        tabIndex={-1}
        aria-labelledby="beta-loop-title"
        className="mx-auto w-full max-w-7xl scroll-mt-6 px-6 py-14 sm:py-16 lg:px-12"
      >
        <p className="font-mono text-xs text-muted-foreground uppercase">The beta loop</p>
        <h2
          id="beta-loop-title"
          className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-[2.5rem] sm:leading-[2.75rem]"
        >
          A deliberate path to a useful first observation.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {loopSteps.map((step) => (
            <article key={step.number} className="rounded-2xl border bg-card p-5 sm:p-6">
              <p className="font-mono text-xs text-muted-foreground">{step.number}</p>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border bg-muted p-5 sm:p-6">
          <h3 className="font-medium">Invitation-only access</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            An invitation includes the private registration link for that account. This page does
            not collect access requests or create accounts.
          </p>
        </div>
      </section>

      <section aria-labelledby="questions-heading" className="bg-muted">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-14 sm:py-16 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10 lg:px-12">
          <h2 id="questions-heading" className="text-4xl font-semibold tracking-[-0.04em]">
            The important questions first.
          </h2>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <article key={faq.question} className="rounded-2xl border bg-card p-5">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex min-h-24 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-6 font-mono text-xs lg:px-12">
        <span>TRAINING HUB · PRIVATE BETA</span>
        <span className="text-muted-foreground">Evidence before advice.</span>
      </footer>
    </div>
  );
}
