/**
 * Real-browser verification of slice 1: both example hosts connect their
 * artifact, propagate theme changes, run the artifact with an opaque origin,
 * and survive destroy/recreate without stale state. Servers are started by
 * playwright.config.ts.
 */

import { expect, test, type Page } from "@playwright/test";

const examples = [
  { name: "plain HTML", url: "http://127.0.0.1:4173/", artifactId: "art_plain_01", revision: "4" },
  { name: "React", url: "http://127.0.0.1:4174/", artifactId: "art_react_01", revision: "9" },
] as const;

function artifact(page: Page) {
  return page.frameLocator("#preview");
}

for (const example of examples) {
  test.describe(`${example.name} runtime example`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(example.url);
    });

    test("artifact connects with an opaque origin and shows the host's identity and revision", async ({
      page,
    }) => {
      const frame = artifact(page);
      await expect(frame.locator("#status")).toHaveText("connected");
      await expect(frame.locator("#artifact-id")).toHaveText(example.artifactId);
      await expect(frame.locator("#revision")).toHaveText(example.revision);
      await expect(frame.locator("#theme")).toHaveText("light");
      await expect(frame.locator("#origin")).toHaveText("null");
      await expect(frame.locator("#error")).toHaveText("-");
      await expect(page.locator("#artifact-id")).toHaveText(example.artifactId);
    });

    test("theme toggles propagate live", async ({ page }) => {
      const frame = artifact(page);
      await expect(frame.locator("#status")).toHaveText("connected");
      await page.click("#toggle-theme");
      await expect(frame.locator("#theme")).toHaveText("dark");
      await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.click("#toggle-theme");
      await expect(frame.locator("#theme")).toHaveText("light");
    });

    test("destroy and recreate yield a fresh session that receives the current theme", async ({
      page,
    }) => {
      const frame = artifact(page);
      await expect(frame.locator("#status")).toHaveText("connected");
      const firstSession = await page.locator("#session").textContent();

      await page.click("#destroy");
      await expect(page.locator("#preview")).toHaveCount(0);
      await expect(page.locator("#session")).toHaveText("(no preview)");

      await page.click("#toggle-theme");
      await page.click("#recreate");
      await expect(frame.locator("#status")).toHaveText("connected");
      await expect(frame.locator("#theme")).toHaveText("dark");
      await expect(page.locator("#session")).not.toHaveText(firstSession ?? "");

      await page.click("#toggle-theme");
      await expect(frame.locator("#theme")).toHaveText("light");
    });

    test("a frame reload reconnects and keeps receiving updates", async ({ page }) => {
      const frame = artifact(page);
      await expect(frame.locator("#status")).toHaveText("connected");
      await page.click("#toggle-theme");
      await expect(frame.locator("#theme")).toHaveText("dark");
      await page.evaluate(() => {
        const iframe = document.querySelector<HTMLIFrameElement>("#preview");
        // Re-setting the src attribute navigates the frame again, like a user-triggered reload.
        iframe?.setAttribute("src", iframe.getAttribute("src") ?? "/artifact.html");
      });
      // The new document connects, receives the current theme, and keeps following updates.
      await expect(frame.locator("#status")).toHaveText("connected");
      await expect(frame.locator("#theme")).toHaveText("dark");
      await page.click("#toggle-theme");
      await expect(frame.locator("#theme")).toHaveText("light");
    });

    test("no console errors during the lifecycle", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.reload();
      const frame = artifact(page);
      await expect(frame.locator("#status")).toHaveText("connected");
      await page.click("#toggle-theme");
      await page.click("#destroy");
      await page.click("#recreate");
      await expect(frame.locator("#status")).toHaveText("connected");
      expect(errors).toEqual([]);
    });
  });
}
