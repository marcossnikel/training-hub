const faqs = [
  {
    question: "What is Training Hub?",
    answer:
      "A personal training-intelligence product for examining patterns in your own activity history. Observations link back to their evidence.",
  },
  {
    question: "Who is this beta for?",
    answer:
      "Self-coached runners and cyclists who already record activities in Strava and are comfortable connecting an app they create themselves.",
  },
  {
    question: "How does the Strava connection work?",
    answer:
      "Each invited athlete uses credentials for their own Strava developer app. Training Hub does not use a shared or founder app by default. This beta path does not resolve Strava commercial or API-policy requirements.",
  },
  {
    question: "Does it replace a coach or provide medical guidance?",
    answer:
      "No. It does not prescribe training, assess readiness, diagnose health, or provide medical guidance.",
  },
  {
    question: "Can I create an account from this page?",
    answer:
      "No. This is a private, invitation-only beta. A valid invitation provides its own private registration link.",
  },
  {
    question: "What will it cost?",
    answer:
      "A single monthly beta plan around US$5 is planned when the product loop and billing are ready. This page does not take payment or promise an availability date.",
  },
] as const;

function LandingSection({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2
        id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
        className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        {title}
      </h2>
      <div className="mt-4 max-w-2xl space-y-3 text-base leading-7 text-muted-foreground sm:text-lg">
        {children}
      </div>
    </section>
  );
}

/** Guest-only root content. It intentionally has no request, data, or tracking work. */
export function PrivateBetaLanding() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <div className="lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(12rem,1fr)] lg:gap-x-20">
        <div>
          <section aria-labelledby="landing-title" className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">
              Personal training intelligence
            </p>
            <h1
              id="landing-title"
              className="mt-4 font-display text-5xl font-semibold tracking-tight text-balance sm:text-6xl"
            >
              Understand the patterns in your own training history.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Training Hub links its weekly training brief and comparable prior-activity
              observations to the activities, dates, metrics, and comparison window behind them.
            </p>
            <a
              href="#beta-access"
              className="focus-ring mt-8 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/80 motion-reduce:transition-none"
            >
              How beta access works
            </a>
          </section>

          <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-20">
            <LandingSection title="Evidence before advice">
              <p>
                The point is a specific observation you can inspect, not a score, prescription, or
                generic summary.
              </p>
              <p>
                When the history is incomplete or the comparison is weak, the limitation belongs
                beside the observation.
              </p>
              <p className="border-l-2 border-border pl-4 text-sm leading-6">
                <span className="font-medium text-foreground">Illustrative.</span> A comparison can
                point back to the activity dates, distance, moving time, and comparison window used.
              </p>
            </LandingSection>

            <LandingSection title="Built for self-coached runners and cyclists">
              <p>
                Use your own activity history to review what changed, what is comparable, and where
                the evidence is incomplete.
              </p>
              <p>
                It is not coaching, a training-plan generator, medical or readiness guidance, or a
                social feed.
              </p>
            </LandingSection>

            <LandingSection title="A transparent beta connection">
              <p>
                During this beta, you connect a Strava app that you create and control. Training Hub
                never falls back to the founder&apos;s Strava credentials.
              </p>
              <p>
                Using your own app is a beta connection path. It does not settle Strava&apos;s
                commercial or API-policy requirements.
              </p>
              <p>
                Your account has its own connection. Disconnecting removes the local connection
                material and Strava-imported and derived data for that connection.
              </p>
            </LandingSection>

            <LandingSection title="A small paid beta, when it is ready">
              <p>
                One monthly beta plan is planned at around US$5. There is no checkout or payment
                collection on this page.
              </p>
            </LandingSection>

            <LandingSection title="Private beta">
              <div
                id="beta-access"
                tabIndex={-1}
                className="scroll-mt-8 rounded-lg border border-border bg-muted/30 p-5 sm:p-6"
              >
                <p>
                  Training Hub is currently invitation-only. An invitation includes the private
                  registration link for that beta account.
                </p>
                <p>This page does not collect access requests or create accounts.</p>
              </div>
            </LandingSection>

            <section aria-labelledby="questions-heading">
              <h2
                id="questions-heading"
                className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Questions, answered plainly
              </h2>
              <div className="mt-6 divide-y divide-border border-y border-border">
                {faqs.map((faq) => (
                  <section
                    key={faq.question}
                    className="py-5"
                    aria-labelledby={`${faq.question.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-faq`}
                  >
                    <h3
                      id={`${faq.question.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-faq`}
                      className="text-base font-semibold"
                    >
                      {faq.question}
                    </h3>
                    <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
                      {faq.answer}
                    </p>
                  </section>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside
          className="mt-12 hidden border-l border-border pl-8 lg:mt-2 lg:block"
          aria-label="Beta boundary"
        >
          <p className="text-sm font-medium text-foreground">Private beta</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Invitation-only access keeps the first cohort deliberate while each athlete connects
            their own Strava app.
          </p>
        </aside>
      </div>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground sm:mt-20">
        Training Hub is a working product name.
      </footer>
    </div>
  );
}
