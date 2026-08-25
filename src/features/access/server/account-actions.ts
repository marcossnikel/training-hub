"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { refreshAll } from "@/lib/action-helpers";
import { isLang } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/lang";

export async function setLangAction(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  refreshAll();
}

/** Revoke the current database session, then return to the public sign-in page. */
export async function logoutAction(): Promise<never> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
