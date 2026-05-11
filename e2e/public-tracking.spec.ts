import { test, expect } from "@playwright/test";

test.describe("Public tracking", () => {
  test("invalid id shows error or empty state", async ({ page }) => {
    await page.goto("/track");
    await page.getByPlaceholder(/awb or order id/i).fill("__invalid_e2e__");
    await page.getByRole("button", { name: /track/i }).click();
    await expect(
      page.getByText(/not found|unavailable|error|no order|invalid/i).first()
    ).toBeVisible({ timeout: 25_000 });
  });
});
