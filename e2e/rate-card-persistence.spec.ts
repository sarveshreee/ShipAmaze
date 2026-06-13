import { test, expect } from "@playwright/test";
import { loginWithEmailPassword } from "./helpers";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proofDir = path.join(__dirname, "..", "docs", "proof-screenshots");

const adminEmail = process.env.ADMIN_TEST_EMAIL ?? "admin@admin.com";
const adminPassword = process.env.ADMIN_TEST_PASSWORD ?? "admin@123";
const dsEmail = process.env.DROPSHIPPER_TEST_EMAIL ?? "dropship@dropship.com";
const dsPassword = process.env.DROPSHIPPER_TEST_PASSWORD ?? "dropship@123";

const PROOF_RATE = "199.99";

test.use({ channel: "chrome" });

test.describe("Rate card persistence proof", () => {
  test("admin saves zone rates → dropshipper rate card reflects update", async ({ page, browser }) => {
    test.setTimeout(120_000);

    // Admin: edit Zone A / 0.5 kg and save
    await loginWithEmailPassword(page, adminEmail, adminPassword);
    await expect(page).toHaveURL(/\/admin\/dashboard/i, { timeout: 30_000 });

    await page.goto("/admin/rates");
    await expect(page.getByRole("heading", { name: /rates & shipping/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/loading/i)).toBeHidden({ timeout: 20_000 });

    const zoneACell = page.locator("tbody tr").first().locator("td").nth(1).getByRole("button");
    await zoneACell.click();
    const input = page.locator('tbody tr:first-child td:nth-child(2) input[type="number"]');
    await expect(input).toBeVisible();
    await input.fill(PROOF_RATE);
    await input.press("Enter");

    await expect(page.getByText(/unsaved changes/i)).toBeVisible();
    await page.getByRole("button", { name: /save rates/i }).click();
    await expect(page.getByText(/rates saved successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/unsaved changes/i)).toBeHidden();

    await page.screenshot({
      path: path.join(proofDir, "01-admin-rates-saved.png"),
      fullPage: true,
    });

    // Dropshipper: open Rate Card tab in separate context (simulates another user session)
    const dsContext = await browser.newContext();
    const dsPage = await dsContext.newPage();
    await loginWithEmailPassword(dsPage, dsEmail, dsPassword);
    await expect(dsPage).toHaveURL(/\/dropshipper\/dashboard/i, { timeout: 30_000 });

    await dsPage.goto("/dropshipper/rates");
    await dsPage.getByRole("button", { name: /^rate card$/i }).click();
    await expect(dsPage.getByRole("heading", { name: /zone-wise rate card/i })).toBeVisible({
      timeout: 20_000,
    });

    const proofCell = dsPage.locator("tbody tr").first().locator("td").nth(1);
    await expect(proofCell).toContainText(PROOF_RATE.replace(".99", ""), { timeout: 15_000 });
    await expect(proofCell).toContainText("199.99");

    await dsPage.screenshot({
      path: path.join(proofDir, "02-dropshipper-rate-card.png"),
      fullPage: true,
    });

    await dsContext.close();
  });
});
