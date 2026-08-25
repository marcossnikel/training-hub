import { expect, type Page, type Request } from "@playwright/test";

type ManualActivityActionResult = { ok: true } | { ok: false; error: string };

export type ManualActivityActionExpectation = {
  date: string;
  km: number;
  shoe: { id: number; name: string };
  successMessage: string;
};

export type ActionRequestSnapshot = {
  method: string;
  url: string;
  actionId: string | undefined;
  body: string | null;
};

type ManualActivityArguments = [
  {
    date: string;
    km: number;
    shoeId: number;
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManualActivityArguments(body: string | null): ManualActivityArguments | null {
  if (!body) return null;
  try {
    const value: unknown = JSON.parse(body);
    if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
    const [input] = value;
    if (
      Object.keys(input).sort().join(",") !== "date,km,shoeId" ||
      typeof input.date !== "string" ||
      typeof input.km !== "number" ||
      typeof input.shoeId !== "number"
    ) {
      return null;
    }
    return [{ date: input.date, km: input.km, shoeId: input.shoeId }];
  } catch {
    return null;
  }
}

/**
 * Next serializes this direct Server Action call as one JSON argument. Match
 * that exact protocol boundary so a neighboring action cannot satisfy the
 * manual-activity proof merely because it is also a POST with Next-Action.
 */
export function matchesManualActivityActionRequest(
  request: ActionRequestSnapshot,
  expected: ManualActivityActionExpectation
): boolean {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  const args = parseManualActivityArguments(request.body);
  return (
    request.method === "POST" &&
    url.pathname === "/settings" &&
    url.search === "" &&
    Boolean(request.actionId?.trim()) &&
    args?.[0].date === expected.date &&
    args[0].km === expected.km &&
    args[0].shoeId === expected.shoe.id
  );
}

function flightJsonRows(payload: string): Map<string, unknown[]> {
  const rows = new Map<string, unknown[]>();
  for (const line of payload.split(/\r?\n/)) {
    const match = /^([0-9a-f]+):(.*)$/i.exec(line);
    if (!match) continue;
    const [, rawId, rawValue] = match;
    if (!rawId || !rawValue?.startsWith("{")) continue;
    try {
      const values = rows.get(rawId.toLowerCase()) ?? [];
      values.push(JSON.parse(rawValue));
      rows.set(rawId.toLowerCase(), values);
    } catch {
      // Flight rows such as dev-only `D` diagnostics are not JSON model rows.
    }
  }
  return rows;
}

function isManualActivityActionResult(value: unknown): value is ManualActivityActionResult {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort().join(",");
  return (
    (value.ok === true && keys === "ok") ||
    (value.ok === false && typeof value.error === "string" && keys === "error,ok")
  );
}

/**
 * Next 16.2.10 places the action promise in the Flight root model's `a` field
 * as `$@<hex row>`. Resolve only that referenced row; unrelated route/action
 * rows may legitimately contain their own `ok` values.
 */
export function parseManualActivityActionResult(payload: string): ManualActivityActionResult {
  const rows = flightJsonRows(payload);
  const root = rows.get("0")?.find((value) => isRecord(value) && typeof value.a === "string");
  if (!isRecord(root) || typeof root.a !== "string") {
    throw new Error("Manual activity action response has no Flight root action reference.");
  }
  const actionReference = /^\$@([0-9a-f]+)$/i.exec(root.a);
  if (!actionReference?.[1]) {
    throw new Error("Manual activity action response has an invalid Flight action reference.");
  }
  const result = rows.get(actionReference[1].toLowerCase())?.find(isManualActivityActionResult);
  if (!result) {
    throw new Error("Manual activity action response has no referenced ActionResult row.");
  }
  return result;
}

export function requireSuccessfulManualActivityActionResult(payload: string): void {
  const result = parseManualActivityActionResult(payload);
  if (!result.ok) {
    throw new Error(`Manual activity Server Action failed: ${result.error}`);
  }
}

function requestSnapshot(request: Request): ActionRequestSnapshot {
  return {
    method: request.method(),
    url: request.url(),
    actionId: request.headers()["next-action"],
    body: request.postData(),
  };
}

/**
 * A cleared distance input is also the form's initial state, so it cannot prove
 * that a submission happened. Bind to the exact manual Server Action request,
 * await that request's response, resolve its Flight result, and require the
 * shipped success feedback before inspecting the disposable SQLite fixture.
 */
export async function expectSuccessfulManualActivityAction(
  page: Page,
  submit: () => Promise<void>,
  expected: ManualActivityActionExpectation
): Promise<void> {
  const form = page.locator("#manual-shoe").locator("xpath=ancestor::form");
  const nativeShoeSelect = form.locator("select");
  await expect(nativeShoeSelect).toHaveValue(String(expected.shoe.id));
  await expect(nativeShoeSelect.locator("option:checked")).toHaveText(expected.shoe.name);

  const actionRequestPromise = page.waitForRequest(
    (request) => matchesManualActivityActionRequest(requestSnapshot(request), expected),
    { timeout: 10_000 }
  );
  await submit();
  const actionRequest = await actionRequestPromise;
  const captured = requestSnapshot(actionRequest);
  const capturedUrl = new URL(captured.url);
  expect(capturedUrl.pathname).toBe("/settings");
  expect(captured.actionId, "the manual request must carry its Next-Action ID").toBeTruthy();
  expect(parseManualActivityArguments(captured.body)).toEqual([
    { date: expected.date, km: expected.km, shoeId: expected.shoe.id },
  ]);

  // `Request.response()` is the response belonging to the matched request;
  // a global response listener could otherwise resolve on an adjacent action.
  const actionResponse = await actionRequest.response();
  if (!actionResponse) throw new Error("The manual activity action request received no response.");
  expect(actionResponse.request()).toBe(actionRequest);
  expect(actionResponse.request().url()).toBe(captured.url);
  expect(actionResponse.request().headers()["next-action"]).toBe(captured.actionId);
  expect(actionResponse.status()).toBe(200);
  expect(actionResponse.headers()["content-type"]).toContain("text/x-component");
  requireSuccessfulManualActivityActionResult(await actionResponse.text());
  await expect(page.getByText(expected.successMessage, { exact: true })).toBeVisible();
}
