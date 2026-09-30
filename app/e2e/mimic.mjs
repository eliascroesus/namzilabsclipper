// Drives the mimic page in headless Chromium, as a user would:
//   node e2e/mimic.mjs --ref ad.mp4 --raw raw.mp4 [--extra a.jpg ...] [--music m.mp3] [--clip]
//                      [--stills 1,2.5,20] [--no-render] [--out DIR]
// Serves a built copy (E2E_DIST, with the speech model at dist/models/parakeet-v3),
// saves screenshots of the page, the template, the plan and the finished video in --out.
import { chromium } from "playwright";
import { preview } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const many = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const outDir = resolve(opt("--out") ?? "e2e-out/mimic");
mkdirSync(outDir, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const dist = process.env.E2E_DIST;
if (!dist) throw new Error("Set E2E_DIST to a built copy of the app.");
const server = await preview({ root, logLevel: "error", build: { outDir: resolve(dist) }, preview: { port: 5197, strictPort: false } });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const t0 = Date.now();
const log = (...m) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...m);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (m) => m.type() !== "debug" && console.error(`[page ${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  page.setDefaultTimeout(0);
  await page.goto(`${base}/mimic.html?test`);
  await page.waitForFunction(() => !!window.__mimic);
  const inputs = page.locator('input[type="file"]');
  const state = () => page.evaluate(() => {
    const s = window.__mimic.get();
    return { study: s.study, hearing: s.hearing, make: s.make, extras: s.extras.map((e) => e.status) };
  });
  const until = async (pred, label) => {
    let last = "";
    for (;;) {
      const s = await state();
      const line = JSON.stringify({ study: s.study.label, sp: Math.round(s.study.progress * 100), hear: s.hearing.label, hp: Math.round(s.hearing.progress * 100), make: s.make.label, mp: Math.round(s.make.progress * 100) });
      if (line !== last) log(label, line);
      last = line;
      if (s.study.stage === "error" || s.hearing.stage === "error" || s.make.stage === "error") throw new Error(JSON.stringify(s));
      if (pred(s)) return s;
      await page.waitForTimeout(1000);
    }
  };
  await inputs.nth(0).setInputFiles(resolve(opt("--ref")));
  await inputs.nth(1).setInputFiles(resolve(opt("--raw")));
  const extras = many("--extra");
  if (extras.length) await inputs.nth(2).setInputFiles(extras.map((e) => resolve(e)));
  if (opt("--music")) await inputs.nth(3).setInputFiles(resolve(opt("--music")));
  if (args.includes("--clip")) await page.evaluate(() => window.__mimic.setOption({ clip: true }));
  await until((s) => s.study.stage === "ready" && s.hearing.stage === "ready" && s.extras.every((e) => e !== "reading"), "waiting");
  await page.screenshot({ path: resolve(outDir, "page-ready.png"), fullPage: false });
  const facts = await page.evaluate(() => {
    const s = window.__mimic.get();
    const t = s.template;
    return { template: { ...t, cards: t.cards.map((c) => ({ ...c, thumb: undefined })), broll: t.broll.map((b) => ({ ...b, thumb: undefined })) }, look: s.look, words: s.words, plan: window.__mimic.plan() };
  });
  writeFileSync(resolve(outDir, "facts.json"), JSON.stringify(facts, null, 1));
  log("template", JSON.stringify(facts.template.notes));
  const stills = opt("--stills");
  if (stills) {
    const times = stills.split(",").map(Number);
    const shots = await page.evaluate(async (times) => {
      const urls = await window.__mimic.preview(times);
      const out = [];
      for (const u of urls) {
        const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        out.push(btoa(s));
      }
      return out;
    }, times);
    shots.forEach((b64, i) => writeFileSync(resolve(outDir, `still-${times[i].toFixed(2)}.jpg`), Buffer.from(b64, "base64")));
    log("stills", times.join(", "));
  }
  if (args.includes("--no-render")) process.exit(0);
  await page.getByRole("button", { name: /Make the edit/ }).click();
  await until((s) => s.make.stage === "ready", "making");
  await page.screenshot({ path: resolve(outDir, "page-done.png"), fullPage: false });
  const saved = await page.evaluate(async () => {
    const r = window.__mimic.get().result;
    const buf = new Uint8Array(await (await fetch(r.url)).arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name: r.name, b64: btoa(s), ms: r.ms };
  });
  writeFileSync(resolve(outDir, saved.name), Buffer.from(saved.b64, "base64"));
  log("saved", saved.name, `render ${Math.round(saved.ms / 1000)} s`);
} finally {
  await browser.close();
  await server.close();
}
