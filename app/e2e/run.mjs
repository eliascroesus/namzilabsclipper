// Drives the harness page in headless Chromium:
//   node e2e/run.mjs <function> '<json args array>' [--out DIR]
// Results print as JSON; files the page saves (window.__save) land in --out.
import { chromium } from "playwright";
import { createServer } from "vite";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [fn, rawArgs = "[]", ...rest] = process.argv.slice(2);
const outDir = rest[0] === "--out" ? resolve(rest[1]) : resolve("e2e-out");
const root = resolve(import.meta.dirname, "..");
const server = await createServer({ root, logLevel: "error", server: { port: 5199, strictPort: false } });
await server.listen();
const port = server.config.server.port ?? 5199;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.error(`[page ${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  await page.exposeFunction("__save", (name, b64) => {
    mkdirSync(outDir, { recursive: true });
    const m = name.match(/^(.*)\.part(\d+)$/);
    if (m) appendFileSync(resolve(outDir, m[1]), Buffer.from(b64, "base64"));
    else writeFileSync(resolve(outDir, name), Buffer.from(b64, "base64"));
  });
  await page.goto(`http://localhost:${port}/harness.html`);
  await page.waitForFunction(() => !!window.harness, null, { timeout: 60000 });
  const t0 = Date.now();
  page.setDefaultTimeout(0);
  const result = await page.evaluate(async ({ fn, args }) => window.harness[fn](...args), { fn, args: JSON.parse(rawArgs) });
  console.log(JSON.stringify(result));
  console.error(`[run] ${fn} took ${Date.now() - t0} ms`);
} finally {
  await browser.close();
  await server.close();
}
