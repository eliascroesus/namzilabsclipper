/**
 * The brand kit (the card's lines, colour and screenshot) survives a reload:
 * the text in localStorage, the screenshot in IndexedDB. Both stay in this
 * browser and nowhere else.
 */
export interface KitFields {
  enabled: boolean;
  /** the device on the card: a laptop for a website, a phone for an app */
  kind: "laptop" | "phone";
  top: string;
  bottom: string;
  accent: string;
  draw: boolean;
  hold: number;
}

const KEY = "clipper.kit.v1";
const DEFAULTS: KitFields = { enabled: true, kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", draw: true, hold: 4 };

export function loadKit(): KitFields {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<KitFields>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveKit(k: KitFields) {
  try {
    const { enabled, kind, top, bottom, accent, draw, hold } = k;
    localStorage.setItem(KEY, JSON.stringify({ enabled, kind, top, bottom, accent, draw, hold }));
  } catch {
    // private mode: the kit just won't be remembered
  }
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("clipper", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("blobs");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveKitShot(blob: Blob | null, name: string) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("blobs", "readwrite");
      if (blob) tx.objectStore("blobs").put({ blob, name }, "cardShot");
      else tx.objectStore("blobs").delete("cardShot");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // not remembered, still used for this session
  }
}

export async function loadKitShot(): Promise<{ blob: Blob; name: string } | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction("blobs").objectStore("blobs").get("cardShot");
      req.onsuccess = () => resolve((req.result as { blob: Blob; name: string } | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
