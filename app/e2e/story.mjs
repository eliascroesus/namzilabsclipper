// The story flow in the real UI, with Gemini answered by a stand-in (no key is
// needed here): drop a talking video, find the moments, make a clip.
//   node e2e/story.mjs [--out DIR]
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const out = resolve(args.out ?? "e2e-out/story");
mkdirSync(out, { recursive: true });
const root = resolve(import.meta.dirname, "..");
const media = (p) => resolve(root, "test-media", p);

// What a transcription of test-media/src/talk.webm looks like (speech found at these times).
const LINES = [
  [8.86, 9.36, "so this is it"],
  [12.94, 13.44, "the special"],
  [14.08, 14.84, "eighty thousand miles"],
  [15.62, 16.34, "and it still pulls"],
  [17.08, 17.38, "listen"],
  [19.64, 20.5, "people told me not to buy it"],
  [21.64, 22.22, "I bought it anyway"],
  [23.14, 23.6, "best decision"],
  [24.1, 24.32, "honestly"],
  [25.68, 26.0, "LOOK AT THAT"],
  [26.56, 27.02, "in the fog too"],
  [28.24, 28.7, "unreal"],
];
const log = [];

const server = await createServer({ root, logLevel: "error", server: { port: 5197, strictPort: false } });
await server.listen();
const port = server.config.server.port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`[console] ${m.text()}`));
  await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.headers()["x-goog-api-key"];
    if (req.method() === "GET" && url.pathname.endsWith("/models")) {
      log.push({ call: "models", key });
      return route.fulfill({
        json: {
          models: [
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
            { name: "models/gemini-3.0-flash-lite", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
          ],
        },
      });
    }
    const body = JSON.parse(req.postData() ?? "{}");
    const parts = body.contents?.[0]?.parts ?? [];
    const audio = parts.find((p) => p.inlineData);
    const model = url.pathname.split("/").pop();
    if (audio) {
      log.push({ call: "transcribe", model, key, mime: audio.inlineData.mimeType, audioBytes: Math.round((audio.inlineData.data.length * 3) / 4), schema: !!body.generationConfig?.responseSchema });
      const phrases = LINES.map(([start, end, text]) => ({ start, end, speaker: "A", text, tone: text === text.toUpperCase() ? "shout" : "normal" }));
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ phrases }) }] }, finishReason: "STOP" }] } });
    }
    const prompt = parts.map((p) => p.text ?? "").join("");
    log.push({ call: "moments", model, key, promptChars: prompt.length, hasTranscript: prompt.includes("[5]") });
    const moments = [
      { first: 1, last: 10, hook: "they told me not to buy it", why: "A dare and a payoff in one breath.", caption: "80k miles and still the best decision", score: 8.5 },
      { first: 5, last: 11, hook: "Best decision honestly", why: "Short and certain.", caption: "no regrets", score: 6 },
    ];
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ moments }) }] }, finishReason: "STOP" }] } });
  });

  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector(".empty");
  await page.getByRole("button", { name: /^Story/ }).click();
  await page.locator("input[type=file][multiple]").first().setInputFiles([media("src/talk.webm"), media("src/car1.webm"), media("src/car4.webm"), media("src/bigbuckbunny.webm")]);
  await page.locator('section:has(.caps:text("Sound")) input[type=file]').first().setInputFiles(media("nio1.webm"));
  await page.waitForFunction(() => document.querySelectorAll(".thumb img").length >= 4 && document.querySelector(".big-number"), null, { timeout: 0 });
  await page.getByLabel("Gemini key").fill("AIza-test-key");
  await page.getByRole("group", { name: "Number of clips" }).getByRole("button", { name: "1", exact: true }).click();
  await page.screenshot({ path: `${out}/1-ready.png` });
  await page.getByRole("button", { name: "Find the moments" }).click();
  await page.waitForSelector(".moment", { timeout: 0 });
  await page.screenshot({ path: `${out}/2-moments.png` });
  await page.getByRole("button", { name: /^Make 1 clip/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".job video").length + document.querySelectorAll(".job .error-text").length >= 1, null, { timeout: 0 });
  const err = await page.locator(".job .error-text").allTextContents();
  if (err.length) console.log("errors:", err);
  await page.evaluate(() => document.querySelectorAll("video").forEach((v) => (v.currentTime = 0.1)));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/3-clip.png` });
  // Save the clip itself.
  const b64 = await page.evaluate(async () => {
    const a = document.querySelector(".job a.btn.primary");
    const blob = await (await fetch(a.href)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  writeFileSync(`${out}/clip.webm`, Buffer.from(b64, "base64"));
  writeFileSync(`${out}/gemini-calls.json`, JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log));
} finally {
  await browser.close();
  await server.close();
}
