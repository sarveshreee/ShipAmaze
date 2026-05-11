import { test, expect } from "@playwright/test";
import { loginWithEmailPassword } from "./helpers";

const adminEmail = process.env.ADMIN_TEST_EMAIL ?? "";
const adminPassword = process.env.ADMIN_TEST_PASSWORD ?? "";
const vendorEmail = process.env.VENDOR_TEST_EMAIL ?? "";
const vendorPassword = process.env.VENDOR_TEST_PASSWORD ?? "";
const dsEmail = process.env.DROPSHIPPER_TEST_EMAIL ?? "";
const dsPassword = process.env.DROPSHIPPER_TEST_PASSWORD ?? "";

test.describe("Role dashboards and core flows", () => {
  test("admin: login → dashboard → orders", async ({ page }) => {
    test.skip(!adminEmail || !adminPassword, "Set ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD");
    await loginWithEmailPassword(page, adminEmail, adminPassword);
    await expect(page).toHaveURL(/\/admin\/dashboard/i, { timeout: 30_000 });
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: /all orders/i })).toBeVisible({ timeout: 20_000 });
  });

  test("dropshipper: pickup address → create draft order", async ({ page }) => {
    test.skip(!dsEmail || !dsPassword, "Set DROPSHIPPER_TEST_EMAIL and DROPSHIPPER_TEST_PASSWORD");
    await loginWithEmailPassword(page, dsEmail, dsPassword);
    await expect(page).toHaveURL(/\/dropshipper\/dashboard/i, { timeout: 30_000 });

    await page.goto("/dropshipper/pickup-addresses");
    await expect(page.getByRole("heading", { name: /pickup addresses/i })).toBeVisible();
    await page.getByRole("button", { name: /add new address|add address/i }).first().click();

    const dialog = page.getByRole("dialog", { name: /new pickup address/i });
    await expect(dialog).toBeVisible();

    const unique = `E2E ${Date.now()}`;
    await dialog.getByLabel(/address name/i).fill(unique);
    await dialog.getByLabel(/contact person/i).fill("E2E Contact");
    await dialog.getByLabel(/^phone$/i).fill("9876543210");
    await dialog.getByLabel(/address line 1/i).fill("E2E Line 1");
    await dialog.getByLabel(/^city$/i).fill("Bengaluru");
    await dialog.locator("select").selectOption("KA");
    await dialog.getByLabel(/^pincode$/i).fill("560001");
    await dialog.getByRole("button", { name: /^save$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 25_000 });

    await page.goto("/dropshipper/create-order");
    await expect(page.getByRole("heading", { name: /create order/i })).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: unique }).first().click();
    await page.getByLabel(/full name/i).fill("Draft Customer E2E");
    await page.getByRole("button", { name: /save as draft/i }).click();
    await expect(page).toHaveURL(/\/dropshipper\/orders/i, { timeout: 30_000 });
  });

  test("dropshipper: wallet page loads", async ({ page }) => {
    test.skip(!dsEmail || !dsPassword, "Set DROPSHIPPER_TEST_EMAIL and DROPSHIPPER_TEST_PASSWORD");
    await loginWithEmailPassword(page, dsEmail, dsPassword);
    await page.goto("/dropshipper/wallet");
    await expect(page.getByRole("heading", { name: /^wallet$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/available balance/i)).toBeVisible();
  });

  test("dropshipper: channel connect page loads", async ({ page }) => {
    test.skip(!dsEmail || !dsPassword, "Set DROPSHIPPER_TEST_EMAIL and DROPSHIPPER_TEST_PASSWORD");
    await loginWithEmailPassword(page, dsEmail, dsPassword);
    await page.goto("/dropshipper/channels");
    await expect(page.getByRole("heading", { name: /channel connect/i })).toBeVisible({ timeout: 20_000 });
  });

  test("vendor: catalogue page loads", async ({ page }) => {
    test.skip(!vendorEmail || !vendorPassword, "Set VENDOR_TEST_EMAIL and VENDOR_TEST_PASSWORD");
    await loginWithEmailPassword(page, vendorEmail, vendorPassword);
    await page.goto("/vendor/catalogue");
    await expect(page.getByRole("heading", { name: /^catalogue$/i })).toBeVisible({ timeout: 20_000 });
  });
});
