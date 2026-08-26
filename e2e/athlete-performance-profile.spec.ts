import { expect, test } from "@playwright/test";

test.describe("athlete performance profile", () => {
  test("keeps a new account unknown, then saves and clears one independent value", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/settings");

    await expect(page.getByText("Every field is optional.", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Unknown — relative calendar labels stay unavailable.")
    ).toBeVisible();
    await expect(page.getByLabel("Lactate threshold heart rate")).toHaveValue("");

    const lthr = page
      .locator("section")
      .filter({ has: page.getByLabel("Lactate threshold heart rate") });
    await page.getByLabel("Lactate threshold heart rate").fill("176");
    await lthr.getByRole("button", { name: "Save" }).click();
    await expect(lthr.getByText("Athlete entered · bpm")).toBeVisible();

    await lthr.getByRole("button", { name: "Clear" }).click();
    await expect(lthr.getByText("Explicitly unknown")).toBeVisible();

    await page.getByLabel("Effective timezone").fill("America/Sao_Paulo");
    const timezone = page.locator("section").filter({ has: page.getByLabel("Effective timezone") });
    await timezone.getByRole("button", { name: "Save" }).click();
    await expect(timezone.getByText("America/Sao_Paulo · Athlete entered")).toBeVisible();
    await timezone.getByRole("button", { name: "Clear athlete override" }).click();
    await expect(
      timezone.getByText("Unknown — relative calendar labels stay unavailable.")
    ).toBeVisible();
    await page.screenshot({ path: "evidence/R19-settings-profile-1440.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByLabel("Lactate threshold heart rate")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390
    );
    await page.screenshot({ path: "evidence/R19-settings-profile-390.png", fullPage: true });
  });
});
