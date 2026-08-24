import { getDict } from "@/lib/lang";

export async function AuthShell({
  mode,
  invited = false,
  title,
  description,
  children,
}: Readonly<{
  mode: "sign-in" | "sign-up";
  invited?: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}>) {
  const { t } = await getDict();
  const signUp = mode === "sign-up";

  return (
    <div
      className="th-foundation grid min-h-svh bg-background lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]"
      data-auth-entry={mode}
    >
      <section className="bg-muted px-6 py-8 sm:px-10 sm:py-10 lg:min-h-svh lg:px-12 lg:py-12">
        <div className="max-w-96">
          <p className="font-mono text-xs font-medium tracking-wide text-foreground">
            {t.authEntry.brand}
          </p>
          <p className="mt-6 font-mono text-xs font-medium tracking-wide text-muted-foreground">
            {signUp && invited ? t.authEntry.invitedStep : t.authEntry.privateBeta}
          </p>
          <p className="font-narrative mt-6 text-[2.65rem] leading-[0.98] tracking-[-0.025em] text-balance text-foreground sm:text-5xl sm:leading-[1.02] lg:text-[3.25rem]">
            {signUp ? t.authEntry.signUpNarrativeTitle : t.authEntry.signInNarrativeTitle}
          </p>
          <p className="mt-6 max-w-[22rem] text-base leading-6 text-muted-foreground">
            {signUp ? t.authEntry.signUpNarrativeBody : t.authEntry.signInNarrativeBody}
          </p>
          <div className="mt-7 rounded-xl border bg-card p-4 text-card-foreground lg:mt-8">
            <p className="font-medium">{t.authEntry.boundaryTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t.authEntry.boundaryBody}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-background px-6 py-10 sm:px-10 sm:py-14 lg:px-12 lg:py-12">
        <div className="w-full max-w-[34rem]">
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.025em] text-balance sm:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-[32rem] text-base leading-6 text-muted-foreground">
            {description}
          </p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </div>
  );
}
