import { expect, test, type Page } from "@playwright/test";

const ACCOUNT = { email: "ada@acme.example" };
const PASSWORD = "correct horse battery";

/** The browser tests have no backend. The real one has its own tests. */
async function mockAccount(page: Page, loggedIn: boolean) {
  let isLoggedIn = loggedIn;
  await page.route("**/api/auth/me", (route) =>
    isLoggedIn
      ? route.fulfill({ json: ACCOUNT })
      : route.fulfill({ status: 401, json: { detail: "Log in to continue." } }),
  );
  return {
    logIn() {
      isLoggedIn = true;
    },
    logOut() {
      isLoggedIn = false;
    },
  };
}

test("sends someone who isn't logged in to the login page", async ({ page }) => {
  await mockAccount(page, false);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("doesn't show the app before the account is confirmed", async ({ page }) => {
  await mockAccount(page, false);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/$/);
  await expect(page.getByLabel("Your message")).toHaveCount(0);
});

test("logs in and shows the account", async ({ page }) => {
  const account = await mockAccount(page, false);
  let body: unknown;
  await page.route("**/api/auth/login", async (route) => {
    body = route.request().postDataJSON();
    account.logIn();
    await route.fulfill({ json: ACCOUNT });
  });

  await page.goto("/login/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByLabel("Your message")).toBeVisible();
  await expect(page.getByText(ACCOUNT.email)).toBeVisible();
  expect(body).toEqual({ email: ACCOUNT.email, password: PASSWORD });
});

test("explains a failed login and lets you try again", async ({ page }) => {
  await mockAccount(page, false);
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { detail: "That email and password don't match." },
    }),
  );

  await page.goto("/login/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
  await expect(page).toHaveURL(/\/login\/$/);
});

test("says when login is rate limited", async ({ page }) => {
  await mockAccount(page, false);
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 429,
      json: { detail: "Too many attempts. Try again later." },
    }),
  );

  await page.goto("/login/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Too many attempts" }),
  ).toBeVisible();
});

test("explains when the backend can't be reached", async ({ page }) => {
  await mockAccount(page, false);
  await page.route("**/api/auth/login", (route) => route.abort());

  await page.goto("/login/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "can’t be reached" })).toBeVisible();
});

test("creates an account from the signup page", async ({ page }) => {
  const account = await mockAccount(page, false);
  await page.route("**/api/auth/signup", async (route) => {
    account.logIn();
    await route.fulfill({ status: 201, json: ACCOUNT });
  });

  await page.goto("/login/");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\/$/);

  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByLabel("Your message")).toBeVisible();
});

test("explains a taken email", async ({ page }) => {
  await mockAccount(page, false);
  await page.route("**/api/auth/signup", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "An account with this email already exists." },
    }),
  );

  await page.goto("/signup/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
});

test("asks for a password long enough before sending it", async ({ page }) => {
  await mockAccount(page, false);
  let sent = false;
  await page.route("**/api/auth/signup", async (route) => {
    sent = true;
    await route.abort();
  });

  await page.goto("/signup/");
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByLabel("Password")).toHaveJSProperty("validity.tooShort", true);
  expect(sent).toBe(false);
});

test("sends someone already logged in straight to the app", async ({ page }) => {
  await mockAccount(page, true);
  await page.goto("/login/");
  await expect(page.getByLabel("Your message")).toBeVisible();
});

test("logs out", async ({ page }) => {
  const account = await mockAccount(page, true);
  await page.route("**/api/auth/logout", async (route) => {
    account.logOut();
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL(/\/login\/$/);
});

test("returns to login when the session ends mid-conversation", async ({ page }) => {
  await mockAccount(page, true);
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 401, json: { detail: "Log in to continue." } }),
  );

  await page.goto("/");
  await page.getByLabel("Your message").fill("An NDA");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/\/login\/$/);
});

test("explains the message limit and offers a retry", async ({ page }) => {
  await mockAccount(page, true);
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 429, json: { detail: "Too many attempts." } }),
  );

  await page.goto("/");
  await page.getByLabel("Your message").fill("An NDA");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("log").getByRole("alert")).toContainText("Wait a minute");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("fits a phone screen without horizontal scrolling", async ({ page }) => {
  await mockAccount(page, false);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/login/");
  await expect(page.getByLabel("Email")).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});
