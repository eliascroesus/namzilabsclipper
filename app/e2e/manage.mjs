// The controls around the edits, in the real UI: the song timeline (drag the
// stretch, step it by a bar, back to automatic, the story marker) and deleting
// edits (one waiting, one being made, one finished). Face tracking stays on, so
// the edits also go through it. Prints what it checked and fails loudly.
//   node e2e/manage.mjs [--out DIR]
// Set E2E_DIST=<a vite build> to run against a built copy (an edit to the
// sources then can't reload the page halfway through).
import { chromium } from "playwright";
import { createServer, preview } from "vite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = resolve(args.out ?? "e2e-out/manage");
mkdirSync(out, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const media = (p) => resolve(root, "test-media", p);
const dist = process.env.E2E_DIST;
const server = dist ? await preview({ root, logLevel: "error", build: { outDir: resolve(dist) }, preview: { port: 5193, strictPort: false } }) : await createServer({ root, logLevel: "error", server: { port: 5193, strictPort: false } });
if (!dist) await server.listen();
const url = dist ? server.resolvedUrls.local[0] : `http://localhost:${server.config.server.port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  await page.goto(url);
  await page.waitForSelector(".empty");
  await page.locator("input[type=file][multiple]").first().setInputFiles([media("src/walk-faces.webm"), media("src/letterbox.webm"), media("src/pillarbox.webm"), media("src/car3.webm")]);
  await page.locator('section:has(.caps:text("Sound")) input[type=file]').first().setInputFiles(media("nio4.webm"));
  await page.waitForFunction(() => document.querySelectorAll(".thumb img").length >= 4 && document.querySelector(".timeline .window"), null, { timeout: 0 });

  // The song timeline.
  const label = () => page.locator(".timeline-foot .num").textContent();
  const auto = await label();
  check(auto?.startsWith("0:00"), `a Reel's sound starts at 0:00 (${auto})`);
  // The Sound panel can sit below the fold, under the sticky Make button (the inputs
  // column scrolls): bring the strip to the middle of the view first.
  await page.locator(".timeline .song-strip").evaluate((el) => el.scrollIntoView({ block: "center" }));
  const strip = await page.locator(".timeline .song-strip").boundingBox();
  const win = await page.locator(".timeline .window").boundingBox();
  await page.mouse.move(win.x + win.width / 2, win.y + win.height / 2);
  await page.mouse.down();
  await page.mouse.move(win.x + win.width / 2 + strip.width * 0.35, win.y + win.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragged = await label();
  check(dragged !== auto && (await page.getByRole("button", { name: /Auto/ }).count()) === 1, `dragging moves the start (${dragged}) and offers Auto`);
  await page.locator(".timeline .song-strip").focus();
  await page.keyboard.press("ArrowRight");
  const stepped = await label();
  check(stepped !== dragged, `the arrow keys step it a bar (${stepped})`);
  await page.locator('section:has(.caps:text("Sound"))').screenshot({ path: `${out}/timeline.png` });
  await page.getByRole("button", { name: /Auto/ }).click();
  check((await label()) === auto, "Auto puts it back");
  await page.getByRole("button", { name: /^Story/ }).first().click();
  check(/burst hits at/.test((await label()) ?? ""), "story clips show where the burst hits");
  await page.getByRole("button", { name: /^Montage/ }).first().click();

  // Deleting edits.
  const faces = page.locator("label.switch:has-text('Face tracking') input");
  check(await faces.isChecked(), "face tracking is on");
  await page.getByRole("group", { name: "Number of edits" }).getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: /^Make \d/ }).click();
  await page.waitForSelector(".job", { timeout: 0 });
  const second = page.locator(".job").nth(1);
  await second.hover();
  await second.locator(".del").click();
  check((await page.locator(".job").count()) === 2, "deleting a waiting edit takes it out of the batch");
  await page.waitForFunction(() => document.querySelectorAll(".job video").length >= 1, null, { timeout: 0 });
  log("the first edit is done");
  const busy = page.locator(".job:has(.working)").first();
  if (await busy.count()) {
    await busy.hover();
    await busy.locator(".del").click();
  }
  await page.waitForFunction(() => !document.querySelector(".go .btn.big:not(.primary)"), null, { timeout: 0 });
  check((await page.locator(".job").count()) === 1 && (await page.locator(".job video").count()) === 1, "deleting the one being made stops it, and the batch finishes");
  await page.screenshot({ path: `${out}/after-delete.png` });
  await page.locator(".job").first().hover();
  await page.locator(".job .del").first().click();
  check((await page.locator(".job").count()) === 0 && (await page.locator(".empty").count()) === 1, "deleting the last edit brings back the empty page");
} finally {
  await browser.close();
  await server.close();
}
log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exitCode = failed ? 1 : 0;
