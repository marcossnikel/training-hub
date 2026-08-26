import { expect, test } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

test("a new connection reaches an owner-safe activation summary independently of welcome", async ({
  page,
}) => {
  const email = `activation-${Date.now()}@example.test`;
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(await betaSignUpPath(email));
  await page.getByLabel("Name").fill("Activation athlete");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.goto("/settings");
  await page.getByLabel("Strava Client ID").fill("activation-client");
  await page.getByLabel("Strava Client Secret").fill("activation-secret-not-rendered");
  await page.getByRole("button", { name: "Validate and continue" }).click();
  const authorization = await page.request.get("/api/strava/byo-connect", { maxRedirects: 0 });
  const authorizationLocation = authorization.headers().location;
  if (!authorizationLocation) throw new Error("Expected a Strava authorization location.");
  const state = new URL(authorizationLocation).searchParams.get("state");
  if (!state) throw new Error("Expected an opaque authorization state.");
  const callback = await page.request.get(
    `/api/strava/callback?state=${encodeURIComponent(state)}&code=e2e-authorized-code`,
    { maxRedirects: 0 }
  );
  const callbackLocation = callback.headers().location;
  expect(callbackLocation).toBe("http://localhost:3100/onboarding/connection");
  if (!callbackLocation) throw new Error("Expected an activation redirect.");
  await page.goto(callbackLocation);
  await expect(
    page.getByRole("heading", { name: "Your imported training has a starting point." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Training Log/ })).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("link", { name: /Performance Summary-derived trends/ })
  ).toHaveAttribute("href", "/performance");
  await page.goto("/settings");
  await page.getByRole("link", { name: "Open connection progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Your imported training has a starting point." })
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});
