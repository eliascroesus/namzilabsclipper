// Drives the mimic page in headless Chromium, as a user would:
//   node e2e/mimic.mjs --ref ad.mp4 --raw raw.mp4 [--extra a.jpg ...] [--music m.mp3] [--clip]
//                      [--placement auto|reference] [--fake-gemini] [--sfx none|moves|script] [--mix]
//                      [--stills 1,2.5,20] [--again] [--no-render] [--out DIR]
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
    // (A picture still being looked at counts as still being read.)
    return { study: s.study, hearing: s.hearing, make: s.make, extras: s.extras.map((e) => (e.looking ? "reading" : e.status)) };
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
  if (args.includes("--again")) {
    // The same files dropped again: the reference as studied and the footage as heard come back from the browser's memory.
    const t1 = Date.now();
    await inputs.nth(0).setInputFiles(resolve(opt("--ref")));
    await inputs.nth(1).setInputFiles(resolve(opt("--raw")));
    await page.waitForFunction(() => window.__mimic.get().study.stage === "ready" && window.__mimic.get().hearing.stage === "ready" && window.__mimic.get().template);
    const r = await page.evaluate(() => ({ remembered: window.__mimic.get().remembered, words: window.__mimic.get().words.length, cards: window.__mimic.get().template.cards.length }));
    log("again", JSON.stringify({ ms: Date.now() - t1, ...r }));
  }
  if (args.includes("--fake-gemini")) {
    // Gemini answered here, as it would: the picture of an agency guru where the agencies come
    // up, the sales dashboard on the millions; nowhere for the rest.
    await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.fulfill({ json: { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] } });
      const parts = JSON.parse(req.postData()).contents[0].parts;
      const script = parts[0].text;
      const word = (re) => Number(re.exec(script)?.[1] ?? -1);
      const extras = parts
        .map((p) => /^\nPicture "(\w+)" \((\w+)\)(?:, named "([^"]*)")?(?:, with this text on it: "([^"]*)")?/.exec(p.text ?? ""))
        .filter(Boolean)
        .map(([, id, , name = "", text = ""]) =>
          /gadzhi/i.test(name) ? { id, label: "Iman Gadzhi on stage", keywords: ["agency", "bureau", "kursus"], basis: "topic", word: word(/(\d+):Agency/), quote: "Agency", why: "the agency guru, where your agency students come up" }
          : /stripe/i.test(text) ? { id, label: "Stripe payments dashboard", keywords: ["omsætning", "kroner", "sales"], basis: "amount", word: word(/(\d+):millioner/), quote: "millioner danske kroner", why: "the sales figure on it is said here" }
          : { id, label: name || "a screen", keywords: [], basis: "none", word: -1, quote: "", why: "" },
        );
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ extras }) }] } }] } });
    });
    await page.evaluate(() => {
      window.__mimic.setKey("test-key");
      window.__mimic.setOption({ ear: "gemini" });
    });
  }
  if (opt("--placement")) await page.evaluate((v) => window.__mimic.setPlacement(v), opt("--placement"));
  if (args.includes("--fake-gemini")) {
    await page.waitForFunction(() => window.__mimic.get().placing.stage === "ready" || window.__mimic.get().placing.stage === "error", null, { timeout: 30000 });
    log("gemini", JSON.stringify(await page.evaluate(() => ({ placing: window.__mimic.get().placing, ai: window.__mimic.get().aiExtras }))));
  }
  // Where each picture went, and why.
  const placed = await page.evaluate(() => {
    const s = window.__mimic.get();
    const plan = window.__mimic.plan();
    return s.extras.map((e) => {
      const c = plan?.cards.find((x) => x.extra === e.id) ?? plan?.broll.find((x) => x.extra === e.id);
      return { name: e.name, label: e.label, look: e.look, tags: e.tags, text: e.text, slot: c?.slot ?? null, at: c ? Math.round(c.start * 100) / 100 : null, end: c ? Math.round(c.end * 100) / 100 : null, place: window.__mimic.extraPlaces[e.id] ?? null };
    });
  });
  writeFileSync(resolve(outDir, "placed.json"), JSON.stringify(placed, null, 1));
  for (const p of placed) log("placed", JSON.stringify({ name: p.name, label: p.label, look: p.look, slot: p.slot, at: p.at, why: p.place?.why, by: p.place?.by, said: p.place?.said?.slice(0, 80) }));
  if (opt("--sfx")) await page.evaluate((v) => window.__mimic.setSfx({ sfxMode: v }), opt("--sfx"));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, "page-ready.png"), fullPage: false });
  // The whole page, tall enough for every card on the right.
  await page.setViewportSize({ width: 1440, height: 3400 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(outDir, "page-tall.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const facts = await page.evaluate(() => {
    const s = window.__mimic.get();
    const t = s.template;
    return { template: { ...t, cards: t.cards.map((c) => ({ ...c, thumb: undefined })), broll: t.broll.map((b) => ({ ...b, thumb: undefined })) }, look: s.look, words: s.words, plan: window.__mimic.plan() };
  });
  writeFileSync(resolve(outDir, "facts.json"), JSON.stringify(facts, null, 1));
  log("template", JSON.stringify(facts.template.notes));
  if (args.includes("--ui-check")) {
    // The sound timeline by hand: a point clicked low on the music's volume lane (a dip), a
    // stretch dragged across and set 12 dB down, the music's bar moved later, a sound effect
    // dragged along.
    await page.setViewportSize({ width: 1440, height: 3400 });
    await page.waitForTimeout(500);
    const box = await page.locator(".timeline canvas").boundingBox();
    const dur = await page.evaluate(() => window.__mimic.plan().duration);
    const xAt = (t) => box.x + (t / dur) * box.width;
    await page.mouse.click(xAt(dur * 0.6), box.y + 165);
    if (opt("--music")) {
      await page.mouse.move(xAt(dur * 0.2), box.y + 150);
      await page.mouse.down();
      await page.mouse.move(xAt(dur * 0.35), box.y + 150, { steps: 8 });
      await page.mouse.up();
      await page.locator(".stretch-row input[type=range]").fill("-12");
      await page.waitForTimeout(200);
      await page.locator(".sound-card").screenshot({ path: resolve(outDir, "sound-card-stretch.png") });
      await page.getByRole("button", { name: "Done" }).click();
      const m = await page.evaluate(() => window.__mimic.plan().music);
      // (Its middle: moved later, the song's own start kept.)
      const mid = (m.start + (m.end ?? dur)) / 2;
      await page.mouse.move(xAt(mid), box.y + 102);
      await page.mouse.down();
      await page.mouse.move(xAt(mid + 2.5), box.y + 102, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const music = await page.evaluate(() => ({ at: window.__mimic.get().musicAt, end: window.__mimic.get().musicEnd, from: window.__mimic.get().musicFrom, line: window.__mimic.get().musicLine, song: !!window.__mimic.get().musicSong, plan: window.__mimic.plan().music }));
      log("music", JSON.stringify(music));
      const sound = page.locator(".music-strip").first();
      if (await sound.count()) await sound.screenshot({ path: resolve(outDir, "music-strip.png") });
    }
    const first = await page.evaluate(() => window.__mimic.plan().sfx[0] ?? null);
    if (first) {
      await page.mouse.move(xAt(first.t), box.y + 77);
      await page.mouse.down();
      await page.mouse.move(xAt(first.t + 1), box.y + 77, { steps: 6 });
      await page.mouse.up();
    }
    const after = await page.evaluate((key) => ({ line: window.__mimic.get().musicLine, edits: window.__mimic.get().cueEdits, moved: window.__mimic.plan().sfx.find((c) => c.key === key) ?? null }), first?.key ?? "");
    log("ui", JSON.stringify({ first: first && { key: first.key, t: first.t }, ...after }));
    await page.locator(".sound-card").screenshot({ path: resolve(outDir, "sound-card.png") });
    await page.locator(".cap-layout").screenshot({ path: resolve(outDir, "captions-card.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  if (args.includes("--time-mix")) {
    const t = await page.evaluate(async () => {
      const t0 = performance.now();
      await window.__mimic.soundtrack();
      const t1 = performance.now();
      window.__mimic.setSfx({ sfxDb: 1 });
      await window.__mimic.soundtrack();
      const t2 = performance.now();
      window.__mimic.setSfx({ sfxDb: 0 });
      return { first: Math.round(t1 - t0), again: Math.round(t2 - t1) };
    });
    log("mix time (ms)", JSON.stringify(t));
  }
  if (args.includes("--mix")) {
    // The soundtrack as the page mixes it, as a 16-bit WAV.
    const b64 = await page.evaluate(async () => {
      const { buf } = await window.__mimic.soundtrack();
      const [l, r] = [buf.getChannelData(0), buf.getChannelData(1)];
      const n = buf.length;
      const view = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, x) => [...x].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
      str(0, "RIFF");
      view.setUint32(4, 36 + n * 4, true);
      str(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, buf.sampleRate, true);
      view.setUint32(28, buf.sampleRate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      str(36, "data");
      view.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
        view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
      }
      const bytes = new Uint8Array(view.buffer);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    writeFileSync(resolve(outDir, "mix.wav"), Buffer.from(b64, "base64"));
    log("mix", "mix.wav");
  }
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
