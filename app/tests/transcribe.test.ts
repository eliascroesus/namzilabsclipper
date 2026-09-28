import { afterEach, describe, expect, it, vi } from "vitest";

// No MP3 encoder in Node: any bytes will do, the network is stubbed below.
vi.mock("../src/engine/audio/speech", async (orig) => ({ ...(await orig<typeof import("../src/engine/audio/speech")>()), encodeMp3: async () => new Blob([new Uint8Array(16)]) }));

import { chunkBounds, transcribe } from "../src/engine/story/story";
import type { Run } from "../src/engine/audio/speech";

afterEach(() => vi.unstubAllGlobals());

describe("transcription", () => {
  it("stops calling Gemini as soon as one chunk fails", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 5));
        return new Response(JSON.stringify({ error: { message: "Request contains an invalid argument." } }), { status: 400 });
      }),
    );
    const rate = 16000;
    const y = new Float32Array(rate * 1500);
    const runs: Run[] = [];
    for (let t = 0; t < 1500; t += 5) runs.push({ start: t, end: t + 4 });
    await expect(transcribe(y, rate, runs, { key: "k", model: "gemini-2.5-flash" })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    // Two calls were in flight at most; none started after the failure.
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("puts every chunk's phrases on the video's clock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ phrases: [{ start: 1, end: 2, speaker: "A", text: "hi", tone: "normal" }] }) }] } }] }), { status: 200 })),
    );
    const rate = 16000;
    const y = new Float32Array(rate * 700);
    const runs: Run[] = [];
    for (let t = 0; t < 700; t += 5) runs.push({ start: t, end: t + 4 });
    const tr = await transcribe(y, rate, runs, { key: "k", model: "gemini-2.5-flash" });
    // 700 s splits at pauses near 300 s and 600 s: three chunks, each phrase moved by its chunk's start.
    const bounds = chunkBounds(700, runs);
    expect(bounds.length).toBe(4);
    expect(tr.phrases.map((p) => p.start)).toEqual([1, bounds[1] + 1, bounds[2] + 1]);
    expect(Math.abs(bounds[1] - 300)).toBeLessThan(3);
  });
});
