import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

const ALL_REQUIRED_FIELDS = {
  governingLaw: "Delaware",
  jurisdiction: "New Castle, DE",
  party1: {
    company: "Acme Corp",
    name: "Ada Stone",
    title: "CEO",
    noticeAddress: "ada@acme.example",
  },
  party2: {
    company: "Globex",
    name: "Sam Reed",
    title: "COO",
    noticeAddress: "sam@globex.example",
  },
};

/** Answers each chat request with the next turn. The real backend has its own tests. */
async function mockChat(page: Page, ...updatesPerTurn: object[]) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/chat", async (route: Route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        reply: `Reply ${requests.length}`,
        updates: updatesPerTurn[requests.length - 1] ?? {},
      },
    });
  });
  return requests;
}

async function say(page: Page, text: string) {
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const conversation = (page: Page) =>
  page.getByRole("log", { name: "Conversation" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the greeting and the agreement with blanks", async ({ page }) => {
  await expect(conversation(page)).toContainText("Mutual NDA");

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
  await mockChat(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await say(page, "Averyveryveryveryveryveryveryveryveryverylongcompanyname Inc");
  await expect(conversation(page)).toContainText("Reply 1");

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
  const cover = page.getByRole("article", { name: "Cover Page" });
  await expect(cover).not.toContainText("[Today’s date]");
});

test("fills in the agreement from the assistant's replies", async ({ page }) => {
  await mockChat(
    page,
    { governingLaw: "Delaware", termYears: "3" },
    { termType: "untilTerminated", party2: { company: "Globex" } },
  );
  const cover = page.getByRole("article", { name: "Cover Page" });

  await say(page, "Delaware law, for 3 years");
  await expect(conversation(page)).toContainText("Delaware law, for 3 years");
  await expect(conversation(page)).toContainText("Reply 1");
  await expect(cover).toContainText("Governing Law: Delaware");
  await expect(cover).not.toContainText("[Fill in state]");
  await expect(cover).toContainText("Expires 3 years from Effective Date.");

  await say(page, "Actually until terminated, and the other side is Globex");
  await expect(cover).toContainText("Expires [1 year(s)] from Effective Date.");
  await expect(cover.getByRole("cell", { name: "Globex" })).toBeVisible();
  // Details from the earlier turn stay in place.
  await expect(cover).toContainText("Governing Law: Delaware");
});

test("sends the conversation and current values with each message", async ({
  page,
}) => {
  const requests = await mockChat(page, { governingLaw: "Delaware" });

  await say(page, "Delaware law");
  await expect(conversation(page)).toContainText("Reply 1");
  await say(page, "Next");
  await expect(conversation(page)).toContainText("Reply 2");

  expect(requests).toHaveLength(2);
  const second = requests[1] as {
    messages: { role: string; content: string }[];
    values: { governingLaw: string; effectiveDate: string };
    today: string;
  };
  expect(second.messages.map((message) => message.role)).toEqual([
    "assistant",
    "user",
    "assistant",
    "user",
  ]);
  expect(second.messages.at(-1)?.content).toBe("Next");
  expect(second.values.governingLaw).toBe("Delaware");
  expect(second.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(second.values.effectiveDate).toBe(second.today);
});

test("sends with Enter and adds a line with Shift+Enter", async ({ page }) => {
  await mockChat(page);
  const input = page.getByLabel("Your message");

  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.pressSequentially("Second line");
  await expect(input).toHaveValue("First line\nSecond line");

  await input.press("Enter");
  await expect(conversation(page)).toContainText("Reply 1");
  await expect(input).toHaveValue("");
});

test("doesn't send a blank message", async ({ page }) => {
  const requests = await mockChat(page);
  await say(page, "   ");
  await expect(conversation(page).getByRole("paragraph")).toHaveCount(1);
  expect(requests).toHaveLength(0);
});

test("offers a retry when the assistant fails, without repeating the message", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/chat", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 502, json: { detail: "Unavailable" } });
    } else {
      await route.fulfill({ json: { reply: "Back again", updates: {} } });
    }
  });

  await say(page, "Hello there");
  await expect(conversation(page).getByRole("alert")).toContainText(
    "couldn’t reply",
  );

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(conversation(page)).toContainText("Back again");
  await expect(conversation(page).getByRole("alert")).toBeHidden();
  await expect(conversation(page).getByText("Hello there")).toHaveCount(1);
});

test("locks sending and the download while waiting for a reply", async ({
  page,
}) => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat", async (route) => {
    await released;
    await route.fulfill({ json: { reply: "Done", updates: {} } });
  });

  await say(page, "Hello");
  await expect(conversation(page)).toContainText("The assistant is replying…");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  release();
  await expect(conversation(page)).toContainText("Done");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

test("locks sending while the PDF is being created", async ({ page }) => {
  await mockChat(page, ALL_REQUIRED_FIELDS);
  await say(page, "Here are all the details");
  await expect(conversation(page)).toContainText("Reply 1");

  // Slows the PDF library's download to hold the page in its generating state.
  await page.route("**/_next/static/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByRole("button", { name: "Creating PDF…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

  await downloadPromise;
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

test("lists what's missing until the required fields are valid", async ({
  page,
}) => {
  await mockChat(page, { governingLaw: "Delaware" });
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByText("Fix 10 fields to download the PDF.")).toBeVisible();
  await expect(
    page.getByText("Governing law: Enter the governing law."),
  ).toBeVisible();
  await expect(page.getByText("Party 2 company: Enter a company.")).toBeAttached();

  await say(page, "Delaware law");
  await expect(page.getByText("Fix 9 fields to download the PDF.")).toBeVisible();
  await expect(
    page.getByText("Governing law: Enter the governing law."),
  ).toBeHidden();
  expect(downloaded).toBe(false);
});

test("rejects characters the PDF can't display", async ({ page }) => {
  await mockChat(page, {
    ...ALL_REQUIRED_FIELDS,
    party1: { ...ALL_REQUIRED_FIELDS.party1, name: "Čapek" },
  });
  await say(page, "Here are all the details");
  await expect(conversation(page)).toContainText("Reply 1");

  await page.getByRole("button", { name: "Download PDF" }).click();

  await expect(page.getByText("Party 1 name: Remove “Č”.")).toBeVisible();
});

test("downloads the completed agreement, sending details only to the chat API", async ({
  page,
}) => {
  await mockChat(page, ALL_REQUIRED_FIELDS);
  const requests: { url: string; hasDetails: boolean }[] = [];
  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      hasDetails: /Acme|Ada Stone|Delaware/.test(request.postData() ?? ""),
    });
  });

  await say(page, "Acme Corp and Globex, Delaware law");
  await expect(conversation(page)).toContainText("Reply 1");

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
  for (const { url, hasDetails } of requests) {
    if (!url.startsWith("blob:")) expect(url.startsWith(origin)).toBe(true);
    if (!url.endsWith("/api/chat")) expect(hasDetails).toBe(false);
  }
});
