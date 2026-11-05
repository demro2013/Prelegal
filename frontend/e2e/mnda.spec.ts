import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function fillRequiredFields(page: Page) {
  await page.getByLabel("Governing law").fill("Delaware");
  await page.getByLabel("Jurisdiction").fill("New Castle, DE");

  const parties = [
    ["Acme Corp", "Ada Stone", "CEO", "ada@acme.example"],
    ["Globex", "Sam Reed", "COO", "sam@globex.example"],
  ];
  for (const [index, [company, name, title, address]] of parties.entries()) {
    await page.locator(`[name="parties.${index}.company"]`).fill(company);
    await page.locator(`[name="parties.${index}.name"]`).fill(name);
    await page.locator(`[name="parties.${index}.title"]`).fill(title);
    await page.locator(`[name="parties.${index}.noticeAddress"]`).fill(address);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the agreement with blanks before anything is entered", async ({
  page,
}) => {
  const preview = page.getByRole("region", { name: "Agreement preview" });
  await expect(
    preview.getByRole("heading", {
      name: "Mutual Non-Disclosure Agreement",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Standard Terms" }),
  ).toBeVisible();
  await expect(preview.getByText("[Fill in state]")).toBeVisible();
  await expect(preview.getByText("Sign here")).toHaveCount(2);
});

test("applies the stylesheet", async ({ page }) => {
  await expect(
    page.getByRole("region", { name: "Agreement preview" }),
  ).toHaveCSS("background-color", "rgb(35, 71, 59)");
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCSS(
    "background-color",
    "rgb(27, 63, 168)",
  );
});

test("fits a phone screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const isClipped = await page.evaluate(() => {
    const table = document.querySelector("table")!;
    return (
      document.documentElement.scrollWidth > window.innerWidth ||
      table.scrollWidth > table.clientWidth
    );
  });
  expect(isClipped).toBe(false);
});

test("fills today's date in by default", async ({ page }) => {
  await expect(page.getByLabel("Effective date")).not.toHaveValue("");
});

test("keeps a cleared date blank and blocks the download", async ({ page }) => {
  const date = page.getByLabel("Effective date");
  await date.fill("");
  await expect(date).toHaveValue("");

  const cover = page.getByRole("article", { name: "Cover Page" });
  await expect(cover).toContainText("[Today’s date]");

  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByText("Choose the effective date.")).toBeVisible();
  await expect(date).toBeFocused();
});

test("focuses invalid party fields in form order", async ({ page }) => {
  await page.getByLabel("Governing law").fill("Delaware");
  await page.getByLabel("Jurisdiction").fill("New Castle, DE");

  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.locator('[name="parties.0.company"]')).toBeFocused();
});

test("locks the form while the PDF is being created", async ({ page }) => {
  await fillRequiredFields(page);
  // Slows the PDF library's download to hold the form in its generating state.
  await page.route("**/_next/static/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByRole("button", { name: "Creating PDF…" })).toBeDisabled();
  await expect(page.getByLabel("Governing law")).toBeDisabled();

  await downloadPromise;
  await expect(page.getByLabel("Governing law")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

test("updates the preview as the form changes", async ({ page }) => {
  const cover = page.getByRole("article", { name: "Cover Page" });

  await page.getByLabel("Governing law").fill("Delaware");
  await expect(cover).toContainText("Governing Law: Delaware");
  await expect(cover).not.toContainText("[Fill in state]");

  await page.getByLabel("MNDA term: number of years").fill("3");
  await expect(cover).toContainText("Expires 3 years from Effective Date.");

  await page.getByRole("radio", { name: "Continues until terminated" }).check();
  await expect(cover).toContainText("Expires [1 year(s)] from Effective Date.");

  await page.locator('[name="parties.1.company"]').fill("Globex");
  await expect(cover.getByRole("cell", { name: "Globex" })).toBeVisible();
});

test("blocks the download until required fields are valid", async ({ page }) => {
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByText("Fix 10 fields to download the PDF.")).toBeVisible();
  await expect(page.getByLabel("Governing law")).toBeFocused();
  await expect(page.getByText("Enter the governing law.")).toBeVisible();
  await expect(page.getByLabel("Governing law")).toBeInViewport();
  // Nothing, such as the sticky download bar, covers the focused field.
  await expect
    .poll(() =>
      page.getByLabel("Governing law").evaluate((input) => {
        const box = input.getBoundingClientRect();
        return (
          document.elementFromPoint(box.x + 20, box.y + box.height / 2) === input
        );
      }),
    )
    .toBe(true);

  await page.getByLabel("Governing law").fill("Delaware");
  await expect(page.getByText("Fix 9 fields to download the PDF.")).toBeVisible();
  await expect(page.getByText("Enter the governing law.")).toBeHidden();
  expect(downloaded).toBe(false);
});

test("rejects characters the PDF can't display", async ({ page }) => {
  await fillRequiredFields(page);
  await page.locator('[name="parties.0.name"]').fill("Čapek");

  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByText("Remove “Č”.")).toBeVisible();
  await expect(page.locator('[name="parties.0.name"]')).toBeFocused();
});

test("downloads the completed agreement without sending what was entered", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(
      `${request.method()} ${request.url()} ${request.postData() ?? ""}`,
    );
  });

  await fillRequiredFields(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("Mutual-NDA-Acme-Corp-Globex.pdf");
  const file = await readFile(await download.path());
  expect(file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  await expect(
    page.getByText("Downloaded Mutual-NDA-Acme-Corp-Globex.pdf"),
  ).toBeVisible();

  const origin = new URL(page.url()).origin;
  for (const request of requests) {
    expect(request).not.toMatch(/Acme|Ada Stone|Delaware/);
    const url = request.split(" ")[1];
    if (!url.startsWith("blob:")) expect(url.startsWith(origin)).toBe(true);
  }
});
