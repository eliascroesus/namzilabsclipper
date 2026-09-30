import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPicture, fingerprint, fromPaste, PasteError, pastedName, pictureInHtml, pictureLink } from "../src/mimic/ui/paste";

/** What a paste event carries: files, and the clipboard's text in its forms. */
function clipboard(files: File[], data: Record<string, string> = {}) {
  return {
    items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })) as unknown as DataTransferItemList,
    files: files as unknown as FileList,
    getData: (k: string) => data[k] ?? "",
  };
}
const png = (name = "image.png") => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, { type: "image/png" });

describe("a picture pasted", () => {
  it("copied in a tab (right-click, Copy image): the picture, named by its alt text", () => {
    // Chrome puts the picture on the clipboard as a PNG, with the tag it came from.
    const p = fromPaste(clipboard([png()], { "text/html": `<meta charset='utf-8'><img src="https://upload.wikimedia.org/a/Andrew_Tate.jpg" alt="Andrew Tate in 2022"/>` }), 1);
    expect(p.link).toBeNull();
    expect(p.files).toHaveLength(1);
    expect(p.files[0].name).toBe("Andrew Tate in 2022.png");
    expect(p.files[0].type).toBe("image/png");
  });

  it("named by its link's file name without alt text, or numbered without either", () => {
    expect(fromPaste(clipboard([png()], { "text/html": `<img src="https://example.com/pics/tate-portrait.jpg?w=800">` }), 1).files[0].name).toBe("tate-portrait.png");
    const two = fromPaste(clipboard([png(), png("image.png")]), 3);
    expect(two.files.map((f) => f.name)).toEqual(["Picture 3.png", "Picture 4.png"]);
  });

  it("keeps a real file's own name (copied from a folder)", () => {
    const jpg = new File([new Uint8Array([255, 216, 255])], "IMG_2041.JPG", { type: "image/jpeg" });
    expect(fromPaste(clipboard([jpg]), 1).files[0].name).toBe("IMG_2041.JPG");
  });

  it("takes clips too, and nothing else", () => {
    const clip = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const doc = new File([new Uint8Array(4)], "notes.pdf", { type: "application/pdf" });
    expect(fromPaste(clipboard([clip, doc]), 1).files.map((f) => f.name)).toEqual(["clip.mp4"]);
  });

  it("is a link when only a link or a piece of a page came", () => {
    expect(fromPaste(clipboard([], { "text/plain": "https://example.com/a.jpg" }), 1).link).toEqual({ url: "https://example.com/a.jpg" });
    expect(fromPaste(clipboard([], { "text/html": `<p>Look</p><img alt='Tate' src='https://x.com/t.webp?a=1&amp;b=2'>` }), 1).link).toEqual({ url: "https://x.com/t.webp?a=1&b=2", alt: "Tate" });
    expect(fromPaste(clipboard([], { "text/uri-list": "# from a drag\r\nhttps://example.com/b.png" }), 1).link).toEqual({ url: "https://example.com/b.png" });
    expect(fromPaste(clipboard([], { "text/plain": "just some words" }), 1)).toEqual({ files: [], link: null });
  });
});

describe("reading links and names", () => {
  it("finds a page piece's picture, quoted any way, and only real links", () => {
    expect(pictureInHtml(`<img class=x src=https://a.com/p.png alt="A &quot;B&quot;">`)).toEqual({ url: "https://a.com/p.png", alt: 'A "B"' });
    expect(pictureInHtml(`<img src="/relative.png">`)).toBeNull();
    expect(pictureInHtml(`<p>no picture</p>`)).toBeNull();
    expect(pictureLink("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(pictureLink("ftp://a.com/x.png")).toBeNull();
  });

  it("makes names a file can have", () => {
    expect(pastedName(1, "image/jpeg", { alt: 'Tate: "Top G" / 2023' })).toBe("Tate Top G 2023.jpg");
    expect(pastedName(2, "image/webp")).toBe("Picture 2.webp");
    expect(pastedName(5, "image/png", { url: "https://a.com/%E2%9C%93" })).toBe("Picture 5.png");
  });
});

describe("a picture fetched from a copied link", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comes as a file when the site hands it over", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } }));
    const f = await fetchPicture("https://example.com/p/portrait.jpg", 7, "Andrew Tate");
    expect(f.name).toBe("Andrew Tate.jpg");
    expect(f.type).toBe("image/jpeg");
  });

  it("says to copy the picture itself when the site won't, or the link isn't a picture", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchPicture("https://example.com/a.jpg", 1)).rejects.toThrow(PasteError);
    await expect(fetchPicture("https://example.com/a.jpg", 1)).rejects.toThrow(/Copy image/);
    vi.stubGlobal("fetch", async () => new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    await expect(fetchPicture("https://example.com/page", 1)).rejects.toThrow(/isn't a picture/);
  });
});

describe("a picture pasted twice", () => {
  it("has the same fingerprint, and another picture another", async () => {
    expect(await fingerprint(png("a.png"))).toBe(await fingerprint(png("b.png")));
    expect(await fingerprint(png())).not.toBe(await fingerprint(new File([new Uint8Array([1])], "c.png", { type: "image/png" })));
  });
});
