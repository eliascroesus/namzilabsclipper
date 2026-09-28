// Uses the app the way a person would, in headless Chromium: drop footage and
// a sound, make edits, and screenshot each stage into --out.
//   node e2e/ui.mjs [--out DIR] [--variants N] [--format montage|twist|meme] [--aspect 9x16]
import { chromium } from "playwright";
import { createServer, preview } from "vite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = resolve(args.out ?? "e2e-out/ui");
mkdirSync(out, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const media = (p) => resolve(root, "test-media", p);
const footage = (args.footage ?? "src/car1.webm,src/car2-rotated.mp4,src/car3.webm,src/car4.webm,src/car5.webm,src/nio2.webm,src/nio5.webm,src/nio7.webm,src/bigbuckbunny.webm").split(",").map(media);
const sound = media(args.sound ?? "mico.webm");

// E2E_DIST=<a vite build> serves that instead of the live sources (an edit to them
// then can't reload the page halfway through).
const dist = process.env.E2E_DIST;
const server = dist ? await preview({ root, logLevel: "error", build: { outDir: resolve(dist) }, preview: { port: 5198, strictPort: false } }) : await createServer({ root, logLevel: "error", server: { port: 5198, strictPort: false } });
if (!dist) await server.listen();
const url = dist ? server.resolvedUrls.local[0] : `http://localhost:${server.config.server.port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`[console] ${m.text()}`));
  await page.goto(url);
  await page.waitForSelector(".empty");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/1-empty.png` });

  if (args.format) await page.getByRole("button", { name: new RegExp(`^${args.format}`, "i") }).first().click();
  const t0 = Date.now();
  await page.locator('input[type=file][multiple]').first().setInputFiles(footage);
  await page.locator('section:has(.caps:text("Sound")) input[type=file]').first().setInputFiles(sound);
  await page.waitForFunction((n) => document.querySelectorAll(".thumb img").length >= n && document.querySelector(".big-number"), footage.length, { timeout: 0 });
  console.log(`read and scanned ${footage.length} files and the sound in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (args.aspect) await page.getByRole("group", { name: "Frame" }).getByRole("button", { name: args.aspect.replace("x", ":") }).click();
  const variants = Number(args.variants ?? 2);
  await page.getByRole("group", { name: "Number of edits" }).getByRole("button", { name: String(variants), exact: true }).click();
  await page.screenshot({ path: `${out}/2-ready.png` });

  await page.getByRole("button", { name: /^Make \d/ }).click();
  await page.waitForSelector(".job .pct", { timeout: 0 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/3-rendering.png` });
  const t1 = Date.now();
  await page.waitForFunction((n) => document.querySelectorAll(".job video").length + document.querySelectorAll(".job .error-text").length >= n, variants, { timeout: 0 });
  console.log(`made ${variants} edits in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  await page.evaluate(() => document.querySelectorAll("video").forEach((v) => (v.currentTime = 1.2)));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/4-results.png` });
  const errors = await page.locator(".job .error-text").allTextContents();
  if (errors.length) console.log("errors:", errors);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/5-phone.png`, fullPage: false });
} finally {
  await browser.close();
  await server.close();
}
