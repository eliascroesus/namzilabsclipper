// Pastes pictures into the mimic page in headless Chromium, as a user would after copying
// one in another tab: a paste on the page, the same picture again, the Paste button, a real
// Ctrl+V, and a card's own paste button. The picture is drawn in the page (no files needed).
//   E2E_DIST=dist node e2e/mimic-paste.mjs [--out DIR]
import { chromium } from "playwright";
import { preview } from "vite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const outDir = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "e2e-out/mimic-paste");
mkdirSync(outDir, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const dist = process.env.E2E_DIST;
if (!dist) throw new Error("Set E2E_DIST to a built copy of the app.");
const server = await preview({ root, logLevel: "error", build: { outDir: resolve(dist) }, preview: { port: 5198, strictPort: false } });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const fail = (m) => {
  throw new Error(m);
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  await page.goto(`${base}/mimic.html?test`);
  await page.waitForFunction(() => !!window.__mimic);
  const extras = () => page.evaluate(() => window.__mimic.get().extras.map((e) => ({ name: e.name, status: e.status })));
  const settle = () => page.waitForFunction(() => window.__mimic.get().extras.every((e) => e.status !== "reading"));
  const note = () => page.evaluate(() => window.__mimic.get().pasted?.text ?? "");

  // A picture as the clipboard would hold it (Chrome copies pictures as PNG).
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(600, 750);
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 600, 750);
    grad.addColorStop(0, "#3a2a1a");
    grad.addColorStop(1, "#c9a27a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 600, 750);
    g.fillStyle = "#f2d4b6";
    g.beginPath();
    g.ellipse(300, 300, 120, 160, 0, 0, Math.PI * 2);
    g.fill();
    window.__png = await c.convertToBlob({ type: "image/png" });
  });
  const pasteEvent = (html) =>
    page.evaluate((html) => {
      const dt = new DataTransfer();
      if (window.__png) dt.items.add(new File([window.__png], "image.png", { type: "image/png" }));
      if (html) dt.setData("text/html", html);
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, html);

  // 1. Pasted on the page, with the tag Chrome copies alongside: named by its alt text.
  await pasteEvent(`<meta charset='utf-8'><img src="https://example.com/tate.jpg" alt="Andrew Tate"/>`);
  await page.waitForFunction(() => window.__mimic.get().extras.length === 1);
  await settle();
  let x = await extras();
  if (x[0].name !== "Andrew Tate.png" || x[0].status !== "ready") fail(`first paste: ${JSON.stringify(x)}`);
  console.log("paste on the page:", JSON.stringify(x), "|", await note());

  // 2. The same picture again: not added twice.
  await pasteEvent("");
  await page.waitForFunction(() => /already/.test(window.__mimic.get().pasted?.text ?? ""));
  x = await extras();
  if (x.length !== 1) fail(`duplicate added: ${JSON.stringify(x)}`);
  console.log("same picture again:", await note());

  // 3. A copied link to a picture, fetched from a site that allows it (this page's own server).
  await page.evaluate(() => (window.__png = null));
  await page.evaluate((url) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", url);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `${base}/demo-dashboard.jpg`);
  await page.waitForFunction(() => window.__mimic.get().extras.length === 2);
  await settle();
  x = await extras();
  if (x[1].name !== "demo-dashboard.jpg" || x[1].status !== "ready") fail(`copied link: ${JSON.stringify(x)}`);
  console.log("a copied link:", JSON.stringify(x[1]), "|", await note());
  await page.evaluate(() => window.__mimic.get().extras.slice(1).forEach((e) => window.__mimic.removeExtra(e.id)));

  // 4. The Paste button: reads the clipboard (a different picture this time).
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 400);
    const g = c.getContext("2d");
    g.fillStyle = "#1d4ed8";
    g.fillRect(0, 0, 400, 400);
    const blob = await c.convertToBlob({ type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.waitForFunction(() => window.__mimic.get().extras.length === 2);
  await settle();
  x = await extras();
  if (x[1].status !== "ready") fail(`Paste button: ${JSON.stringify(x)}`);
  console.log("Paste button:", JSON.stringify(x[1]), "|", await note());

  // 5. A real Ctrl+V on the page, after copying another picture.
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(300, 500);
    const g = c.getContext("2d");
    g.fillStyle = "#16a34a";
    g.fillRect(0, 0, 300, 500);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": await c.convertToBlob({ type: "image/png" }) })]);
  });
  await page.locator("main").click({ position: { x: 700, y: 900 } });
  await page.keyboard.press("Control+V");
  const viaKeys = await page
    .waitForFunction(() => window.__mimic.get().extras.length === 3, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await settle();
  console.log("Ctrl+V:", viaKeys ? JSON.stringify((await extras())[2]) : "no paste event (headless has no system paste)");

  // 6. A card's own paste button: the picture goes in and is picked for that card.
  await page.evaluate(() => {
    const card = (id, start, run) => ({ id, start, end: start + 0.5, rect: [0.1, 0.2, 0.8, 0.56], enter: { kind: "slide", from: "right", dur: 0.2, ease: "out" }, exit: { kind: "cut", dur: 0, ease: "linear" }, run, content: "photo", radius: 0 });
    window.__mimic.set({ template: { version: 1, name: "t", duration: 20, width: 1080, height: 1920, speech: [{ start: 0, end: 18 }], captions: null, cards: [card("card1", 1, 0), card("card2", 1.5, 0)], broll: [], zoom: null, sound: { bed: null, sfx: [] }, tail: 0, speaker: null, maxPause: 0.3, notes: [] } });
  });
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(500, 500);
    const g = c.getContext("2d");
    g.fillStyle = "#f59e0b";
    g.fillRect(0, 0, 500, 500);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": await c.convertToBlob({ type: "image/png" }) })]);
  });
  await page.getByRole("button", { name: "Paste a copied picture into Card 2 at 1.5s" }).click();
  await page.waitForFunction(() => !!window.__mimic.get().assign.card2);
  const s = await page.evaluate(() => {
    const st = window.__mimic.get();
    return { assign: st.assign, into: st.extras.find((e) => e.id === st.assign.card2)?.name, note: st.pasted?.text };
  });
  console.log("card's paste button:", JSON.stringify(s));
  await page.screenshot({ path: resolve(outDir, "paste.png") });
  console.log("ok");
} finally {
  await browser.close();
  await server.close();
}
