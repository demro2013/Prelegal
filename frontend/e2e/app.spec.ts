import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

const PARTIES = {
  "party1.company": "Acme Corp",
  "party1.name": "Ada Stone",
  "party1.title": "CEO",
  "party1.noticeAddress": "ada@acme.example",
  "party2.company": "Globex",
  "party2.name": "Sam Reed",
  "party2.title": "COO",
  "party2.noticeAddress": "sam@globex.example",
};

const NDA_FIELDS = {
  ...PARTIES,
  governingLaw: "Delaware",
  jurisdiction: "New Castle, DE",
};

type Turn = {
  documentType?: string;
  updates?: Record<string, string>;
};

/** Answers each chat request with the next turn. The real backend has its own tests. */
async function mockChat(page: Page, ...turns: Turn[]) {
  const requests: Record<string, unknown>[] = [];
  let documentType: string | null = null;
  await page.route("**/api/chat", async (route: Route) => {
    requests.push(route.request().postDataJSON());
    const turn = turns[requests.length - 1] ?? {};
    documentType = turn.documentType ?? documentType;
    await route.fulfill({
      json: {
        reply: `Reply ${requests.length}`,
        documentType,
        updates: Object.entries(turn.updates ?? {}).map(([key, value]) => ({
          key,
          value,
        })),
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

const preview = (page: Page) =>
  page.getByRole("region", { name: "Agreement preview" });

async function chooseNda(page: Page, updates: Record<string, string> = {}) {
  const requests = await mockChat(page, { documentType: "mutual-nda", updates });
  await say(page, "I need an NDA");
  await expect(preview(page)).toBeVisible();
  return requests;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { email: "ada@acme.example" } }),
  );
  await page.goto("/");
});

test.describe("before a document is chosen", () => {
  test("shows the greeting and lists every document", async ({ page }) => {
    await expect(conversation(page)).toContainText(
      "What type of document would you like to create?",
    );
    await expect(conversation(page)).toContainText("Software License Agreement");
    await expect(
      page.getByRole("heading", { name: "Create a legal agreement" }),
    ).toBeVisible();

    const list = page.getByRole("region", { name: "Available documents" });
    await expect(list.getByRole("listitem")).toHaveCount(11);
    await expect(list).toContainText("Cloud Service Agreement");
    await expect(list).toContainText("Business Associate Agreement");
  });

  test("keeps the download unavailable", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  test("keeps listing documents while the assistant only explains", async ({
    page,
  }) => {
    await mockChat(page, {});
    await say(page, "I need an employment contract");
    await expect(conversation(page)).toContainText("Reply 1");
    await expect(
      page.getByRole("region", { name: "Available documents" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  test("loads only the page, not every template", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.reload();
    await expect(conversation(page)).toBeVisible();
    expect(requests.filter((url) => url.includes("/templates/"))).toEqual([]);
  });
});

test.describe("the Mutual NDA", () => {
  test("shows the agreement with blanks once chosen", async ({ page }) => {
    await chooseNda(page);
    await expect(
      page.getByRole("heading", { name: "Mutual Non-Disclosure Agreement", level: 1 }),
    ).toBeVisible();
    await expect(
      preview(page).getByRole("heading", { name: "Standard Terms" }),
    ).toBeVisible();
    await expect(preview(page).getByText("[Fill in state]")).toBeVisible();
    await expect(preview(page).getByText("Sign here")).toHaveCount(2);
  });

  test("fills today's date in by default", async ({ page }) => {
    await chooseNda(page);
    const cover = page.getByRole("article", { name: "Cover Page" });
    await expect(cover).not.toContainText("[Today’s date]");
  });

  test("fills in the agreement from the assistant's replies", async ({ page }) => {
    await mockChat(
      page,
      {
        documentType: "mutual-nda",
        updates: { governingLaw: "Delaware", termYears: "3" },
      },
      { updates: { termType: "untilTerminated", "party2.company": "Globex" } },
    );
    const cover = page.getByRole("article", { name: "Cover Page" });

    await say(page, "An NDA under Delaware law, for 3 years");
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

  test("downloads the completed agreement, sending details only to the chat API", async ({
    page,
  }) => {
    await chooseNda(page, NDA_FIELDS);
    const requests: { url: string; hasDetails: boolean }[] = [];
    page.on("request", (request) => {
      requests.push({
        url: request.url(),
        hasDetails: /Acme|Ada Stone|Delaware/.test(request.postData() ?? ""),
      });
    });

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
      expect(hasDetails).toBe(false);
    }
  });

  test("lists what's missing until the required fields are valid", async ({
    page,
  }) => {
    await mockChat(
      page,
      { documentType: "mutual-nda" },
      { updates: { governingLaw: "Delaware" } },
    );
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await say(page, "An NDA");
    await expect(preview(page)).toBeVisible();

    await page.getByRole("button", { name: "Download PDF" }).click();

    await expect(page.getByText("Fix 10 fields to download the PDF.")).toBeVisible();
    await expect(page.getByText("Governing Law is still needed.")).toBeVisible();
    await expect(page.getByText("Party 2 company is still needed.")).toBeAttached();

    await say(page, "Delaware law");
    await expect(page.getByText("Fix 9 fields to download the PDF.")).toBeVisible();
    await expect(page.getByText("Governing Law is still needed.")).toBeHidden();
    expect(downloaded).toBe(false);
  });

  test("rejects characters the PDF can't display", async ({ page }) => {
    await chooseNda(page, { ...NDA_FIELDS, "party1.name": "Čapek" });

    await page.getByRole("button", { name: "Download PDF" }).click();

    await expect(page.getByText("Party 1 name: Remove “Č”.")).toBeVisible();
  });
});

test.describe("documents with a generated page", () => {
  const SLA_FIELDS = {
    ...PARTIES,
    parentAgreement: "Cloud Service Agreement dated January 5, 2026",
    subscriptionPeriod: "1 year",
    targetUptime: "99.9%",
  };

  test("show values under the template's terms, with real section numbers", async ({
    page,
  }) => {
    await mockChat(page, {
      documentType: "service-level-agreement",
      updates: { targetUptime: "99.9%" },
    });
    await say(page, "An SLA with 99.9% uptime");

    const cover = page.getByRole("article", { name: "Order Form" });
    await expect(cover).toContainText("Target Uptime");
    await expect(cover).toContainText("99.9%");
    await expect(cover).toContainText("Not specified");
    await expect(cover).toContainText("PROVIDER");
    await expect(cover).toContainText("CUSTOMER");
    await expect(cover.getByText("Sign here")).toHaveCount(2);

    const terms = page.getByRole("article", { name: "Standard Terms" });
    await expect(terms).toContainText("Service Level Agreement");
    await expect(terms).toContainText("3.2");
    await expect(terms).toContainText("(a)");
    await expect(terms).not.toContainText("<span");
  });

  test("download with optional fields empty", async ({ page }) => {
    await mockChat(page, {
      documentType: "service-level-agreement",
      updates: SLA_FIELDS,
    });
    await say(page, "An SLA");
    await expect(preview(page)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(
      "Service-Level-Agreement-Acme-Corp-Globex.pdf",
    );
    const file = await readFile(await download.path());
    expect(file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("block the download until required fields are filled, naming roles", async ({
    page,
  }) => {
    await mockChat(page, { documentType: "service-level-agreement" });
    await say(page, "An SLA");
    await expect(preview(page)).toBeVisible();

    await page.getByRole("button", { name: "Download PDF" }).click();

    await expect(page.getByText("Agreement is still needed.")).toBeVisible();
    await expect(page.getByText("Customer company is still needed.")).toBeAttached();
    await expect(page.getByText("Target Uptime is still needed.")).toHaveCount(0);
  });

  test("keep only the parties when switching documents", async ({ page }) => {
    await mockChat(
      page,
      {
        documentType: "service-level-agreement",
        updates: SLA_FIELDS,
      },
      { documentType: "ai-addendum" },
    );
    await say(page, "An SLA");
    await expect(page.getByRole("article", { name: "Order Form" })).toContainText("99.9%");

    await say(page, "Actually make it an AI Addendum");

    await expect(
      page.getByRole("heading", { name: "AI Addendum", level: 1 }),
    ).toBeVisible();
    const cover = page.getByRole("article", { name: "Cover Page" });
    await expect(cover).toContainText("Training Data");
    await expect(cover).toContainText("Acme Corp");
    await expect(cover).not.toContainText("99.9%");
    await expect(cover).toContainText("[Agreement]");
  });
});

test("offers a retry when the template can't load, without repeating the message", async ({
  page,
}) => {
  await mockChat(page, { documentType: "mutual-nda" }, { documentType: "mutual-nda" });
  let attempts = 0;
  await page.route("**/templates/**", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 500 });
    else await route.continue();
  });

  await say(page, "An NDA");
  await expect(conversation(page).getByRole("alert")).toContainText("couldn’t reply");

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(preview(page)).toBeVisible();
  await expect(conversation(page).getByText("An NDA", { exact: true })).toHaveCount(1);
});

test("applies the stylesheet", async ({ page }) => {
  await chooseNda(page);
  await expect(preview(page)).toHaveCSS("background-color", "rgb(233, 234, 244)");
  await expect(page.getByRole("button", { name: "Send" })).toHaveCSS(
    "background-color",
    "rgb(246, 255, 77)",
  );
});

test("shows how many details are left, and highlights the download when ready", async ({
  page,
}) => {
  await mockChat(
    page,
    { documentType: "mutual-nda", updates: { governingLaw: "Delaware" } },
    { updates: NDA_FIELDS },
  );
  const download = page.getByRole("button", { name: "Download PDF" });

  await say(page, "An NDA");
  await expect(page.getByText("9 details still needed")).toBeVisible();
  await expect(download).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await say(page, "Here are the rest");
  await expect(page.getByText("Ready to download")).toBeVisible();
  await expect(download).toHaveCSS("background-color", "rgb(246, 255, 77)");
});

test("fits a phone screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await chooseNda(page);
  await say(page, "Averyveryveryveryveryveryveryveryveryverylongcompanyname Inc");
  await expect(conversation(page)).toContainText("Reply 2");

  const isClipped = await page.evaluate(() => {
    const table = document.querySelector("table")!;
    return (
      document.documentElement.scrollWidth > window.innerWidth ||
      table.scrollWidth > table.clientWidth
    );
  });
  expect(isClipped).toBe(false);
});

test("sends the conversation, document and current values with each message", async ({
  page,
}) => {
  const requests = await mockChat(
    page,
    { documentType: "mutual-nda" },
    { updates: { governingLaw: "Delaware" } },
  );

  await say(page, "An NDA");
  await expect(conversation(page)).toContainText("Reply 1");
  await say(page, "Delaware law");
  await expect(conversation(page)).toContainText("Reply 2");
  await say(page, "Next");
  await expect(conversation(page)).toContainText("Reply 3");

  expect(requests).toHaveLength(3);
  expect(requests[0].documentType).toBeNull();
  expect(requests[0].values).toEqual({});

  const third = requests[2] as {
    messages: { role: string; content: string }[];
    documentType: string;
    values: Record<string, string>;
    today: string;
  };
  expect(third.documentType).toBe("mutual-nda");
  expect(third.messages.at(-1)?.content).toBe("Next");
  expect(third.values.governingLaw).toBe("Delaware");
  expect(third.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(third.values.effectiveDate).toBe(third.today);
  expect(third.values.termYears).toBe("1");
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
      await route.fulfill({
        json: { reply: "Back again", documentType: null, updates: [] },
      });
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

test("locks sending while waiting for a reply", async ({ page }) => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat", async (route) => {
    await released;
    await route.fulfill({
      json: { reply: "Done", documentType: "mutual-nda", updates: [] },
    });
  });

  await say(page, "Hello");
  await expect(conversation(page)).toContainText("The assistant is replying…");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

  release();
  await expect(conversation(page)).toContainText("Done");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

test("locks sending while the PDF is being created", async ({ page }) => {
  await chooseNda(page, NDA_FIELDS);

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
