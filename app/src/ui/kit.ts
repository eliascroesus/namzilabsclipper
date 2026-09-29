/**
 * The brand kit (the card's lines, colour, screenshot, or a video of the user's
 * own) survives a reload: the text in localStorage, the screenshot and the video
 * in IndexedDB. All of it stays in this browser and nowhere else.
 */
export interface KitFields {
  enabled: boolean;
  /** the device on the card (a laptop for a website, a phone for an app), or a video of the user's own */
  kind: "laptop" | "phone" | "video";
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

async function saveBlob(key: string, blob: Blob | null, name: string) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("blobs", "readwrite");
      if (blob) tx.objectStore("blobs").put({ blob, name }, key);
      else tx.objectStore("blobs").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // not remembered, still used for this session
  }
}

async function loadBlob(key: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction("blobs").objectStore("blobs").get(key);
      req.onsuccess = () => resolve((req.result as { blob: Blob; name: string } | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** The screenshot on the card's laptop or phone. */
export const saveKitShot = (blob: Blob | null, name: string) => saveBlob("cardShot", blob, name);
export const loadKitShot = () => loadBlob("cardShot");
/** The user's own card: a video (a motion design) played at the end in place of the drawn card. */
export const saveKitVideo = (blob: Blob | null, name: string) => saveBlob("cardVideo", blob, name);
export const loadKitVideo = () => loadBlob("cardVideo");

/** Keep a small value in this browser under `key` (IndexedDB), e.g. what smart picks saw in a file. */
export async function remember(key: string, value: unknown) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // not remembered
  }
}

export async function recall<T>(key: string): Promise<T | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction("blobs").objectStore("blobs").get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
