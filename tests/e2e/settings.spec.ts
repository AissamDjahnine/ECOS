import { expect, test } from "@playwright/test";

test.describe("settings and navigation", () => {
  test("switches modes while idle", async ({ page }) => {
    await page.goto("/ps");

    await expect(page.getByRole("button", { name: "PS / PSS" })).toBeVisible();
    await page.getByRole("button", { name: "Sans PS" }).click();
    await expect(page).toHaveURL(/\/sans-ps$/);
    await expect(
      page.getByRole("heading", { name: "Session Monologue" }),
    ).toBeVisible();
  });

  test("persists timer setting across reloads", async ({ page }) => {
    await page.goto("/ps");
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("button", { name: "10 min" }).click();

    await page.reload();

    await expect(page.getByText("10:00")).toBeVisible();
  });
});
