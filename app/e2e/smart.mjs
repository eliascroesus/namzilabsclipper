// Smart picks in the app with a stand-in for Gemini: drops three clips, has the
// stand-in rate one of them as the flex (a supercar) and another as talking,
// checks the edit is built from the flex, and that a reload remembers the ratings
// without asking Gemini again. Saves the contact sheets Gemini would see.
//   node e2e/smart.mjs [--out DIR]
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = resolve(args.out ?? "e2e-out/smart");
mkdirSync(out, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const media = (p) => resolve(root, "test-media", p);
const clips = ["src/walk-faces.webm", "src/car1.webm", "src/letterbox.webm"].map(media);
// What the stand-in says each clip is, in the order they're rated.
const VERDICTS = [
  { kind: "talking", flex: 1, wow: 2 },
  { kind: "car", flex: 9, wow: 8 },
  { kind: "people", flex: 3, wow: 4 },
];

const server = await createServer({ root, logLevel: "error", server: { port: 5194, strictPort: false } });
await server.listen();
const port = server.config.server.port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const calls = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET" && url.pathname.endsWith("/models")) {
      return route.fulfill({ json: { models: [{ name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent"] }] } });
    }
    const body = JSON.parse(req.postData() ?? "{}");
    const parts = body.contents?.[0]?.parts ?? [];
    const verdict = VERDICTS[Math.min(VERDICTS.length - 1, calls.length)];
    const frames = [];
    let sheet = 0;
    for (const p of parts) {
      const m = /frames (\d+) to (\d+)/.exec(p.text ?? "");
      if (m) for (let n = Number(m[1]); n <= Number(m[2]); n++) frames.push({ n, ...verdict });
      if (p.inlineData) writeFileSync(`${out}/sheet-${calls.length + 1}-${++sheet}.jpg`, Buffer.from(p.inlineData.data, "base64"));
    }
    calls.push({ frames: frames.length, schema: !!body.generationConfig?.responseSchema, system: !!body.systemInstruction });
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ frames }) }] }, finishReason: "STOP" }] } });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`[console] ${m.text()}`));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector(".empty");
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.getByLabel("Gemini key").fill("AIzaSyTest-0123456789abcdefghijklmnopqrs");
  // One at a time, so they're rated in a known order.
  for (const c of clips) {
    const n = await page.locator(".thumb").count();
    await page.locator("input[type=file][multiple]").first().setInputFiles([c]);
    await page.waitForFunction((k) => document.querySelectorAll(".thumb img").length > k, n, { timeout: 0 });
  }
  await page.locator('section:has(.caps:text("Sound")) input[type=file]').first().setInputFiles(media("nio4.webm"));
  await page.waitForFunction(() => document.querySelectorAll(".thumb .heat").length >= 3 && document.querySelector(".timeline .window"), null, { timeout: 0 });
  console.log("rated:", JSON.stringify(calls));
  await page.locator('section:has(.caps:text("Footage"))').screenshot({ path: `${out}/footage.png` });
  console.log("smart picks says:", await page.locator(".smart small").textContent());
  // Plan one edit and read which clips it used (the strip's shot titles carry no ids, so ask the plan).
  await page.getByRole("group", { name: "Number of edits" }).getByRole("button", { name: "1", exact: true }).click();
  // Face tracking off: this checks the picks, not the framing (and it's quicker).
  const faces = page.locator("label.switch:has-text('Face tracking')");
  if (await faces.locator("input").isChecked()) await faces.click();
  await page.getByRole("button", { name: /^Make 1 edit/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".job .strip span").length > 0, null, { timeout: 0 });
  const shots = await page.locator(".job .strip span:not(.card)").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage));
  const thumbs = await page.locator(".thumb img").evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  const counts = thumbs.map((t) => shots.filter((s) => s.includes(t)).length);
  console.log("shots per clip (talking, car, people):", counts.join(", "), "of", shots.length);
  if (counts[1] <= counts[0] || counts[1] <= counts[2]) console.log("FAIL: the flex clip should lead");
  await page.getByRole("button", { name: "Stop" }).click().catch(() => undefined);

  // A reload remembers the ratings: no new calls to Gemini.
  const before = calls.length;
  await page.reload();
  await page.waitForSelector(".empty");
  await page.locator("input[type=file][multiple]").first().setInputFiles(clips);
  await page.waitForFunction(() => document.querySelectorAll(".thumb .heat").length >= 3, null, { timeout: 0 });
  console.log(`after reload: ${calls.length - before} new calls (expect 0)`);
} finally {
  await browser.close();
  await server.close();
}
