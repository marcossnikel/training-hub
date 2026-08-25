import { expect, type Page } from "@playwright/test";

/**
 * A cleared distance input is also the form's initial state, so it cannot prove
 * that a submission happened. Require the real Next Action response and the
 * shipped success feedback before inspecting the disposable SQLite fixture.
 */
export async function expectSuccessfulManualActivityAction(
  page: Page,
  submit: () => Promise<void>,
  successMessage: string
): Promise<void> {
  const actionResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]),
    { timeout: 10_000 }
  );
  await submit();
  const actionResponse = await actionResponsePromise;
  expect(actionResponse.status()).toBe(200);
  const actionPayload = await actionResponse.text();
  expect(actionPayload).toContain('"ok":true');
  expect(actionPayload).not.toContain('"ok":false');
  await expect(page.getByText(successMessage, { exact: true })).toBeVisible();
}
