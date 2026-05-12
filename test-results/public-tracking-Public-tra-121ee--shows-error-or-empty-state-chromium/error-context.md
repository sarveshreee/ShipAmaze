# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-tracking.spec.ts >> Public tracking >> invalid id shows error or empty state
- Location: e2e\public-tracking.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8080/track
Call log:
  - navigating to "http://127.0.0.1:8080/track", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Public tracking", () => {
  4  |   test("invalid id shows error or empty state", async ({ page }) => {
> 5  |     await page.goto("/track");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8080/track
  6  |     await page.getByPlaceholder(/awb or order id/i).fill("__invalid_e2e__");
  7  |     await page.getByRole("button", { name: /track/i }).click();
  8  |     await expect(
  9  |       page.getByText(/not found|unavailable|error|no order|invalid/i).first()
  10 |     ).toBeVisible({ timeout: 25_000 });
  11 |   });
  12 | });
  13 | 
```