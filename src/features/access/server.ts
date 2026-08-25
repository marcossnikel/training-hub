import "server-only";

import { requireCurrentUser, type CurrentUser } from "@/lib/auth";
import { client } from "@/lib/db/client";
import { resolveRuntimeConfiguration } from "@/server/config/runtime";
import { environmentIndicatorModel, type EnvironmentIndicatorModel } from "./environment-indicator";

export const APPLICATION_ROLES = ["member", "creator"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export const OPERATIONAL_CAPABILITIES = [
  "viewOperationalEnvironment",
  "manageBetaInvites",
] as const;
export type OperationalCapability = (typeof OPERATIONAL_CAPABILITIES)[number];

const CAPABILITIES_BY_ROLE: Readonly<Record<ApplicationRole, readonly OperationalCapability[]>> = {
  member: [],
  creator: OPERATIONAL_CAPABILITIES,
};

export interface AccessContext extends CurrentUser {
  role: ApplicationRole;
}

function isApplicationRole(value: unknown): value is ApplicationRole {
  return typeof value === "string" && (APPLICATION_ROLES as readonly string[]).includes(value);
}

/**
 * Resolves operational authorization from the validated database session and
 * the corresponding local application user. Request inputs never select role
 * or owner, and the result intentionally remains an ordinary OwnerContext.
 */
export async function requireAccess(): Promise<AccessContext | null> {
  const currentUser = await requireCurrentUser();
  if (!currentUser) return null;

  const result = await client.execute({
    sql: "SELECT role FROM users WHERE id = ?",
    args: [currentUser.userId],
  });
  const role = result.rows[0]?.role;
  if (!isApplicationRole(role)) return null;
  return { ...currentUser, role };
}

export function hasCapability(
  access: Pick<AccessContext, "role">,
  capability: OperationalCapability
): boolean {
  return CAPABILITIES_BY_ROLE[access.role].includes(capability);
}

/** Returns the authenticated creator context, or null for guests and members. */
export async function requireCreator(): Promise<AccessContext | null> {
  const access = await requireAccess();
  return access?.role === "creator" ? access : null;
}

/**
 * Resolves the creator-only display model on the server. Configuration and
 * role details deliberately remain here; Header receives only this small,
 * serializable value (or null).
 */
export async function resolveEnvironmentIndicator(): Promise<EnvironmentIndicatorModel | null> {
  const access = await requireAccess();
  if (!access || !hasCapability(access, "viewOperationalEnvironment")) return null;
  return environmentIndicatorModel(resolveRuntimeConfiguration(process.env).identity);
}
