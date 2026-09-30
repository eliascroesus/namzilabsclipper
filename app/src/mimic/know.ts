/**
 * What words and names mean, for putting pictures where they're talked about: topics (the
 * bits of words that speak of them in Danish, Swedish, Norwegian, German and English), the
 * people and brands these ads show and what they stand for (Iman Gadzhi: agencies and
 * courses; Andrew Tate: get-rich gurus; Stripe: payments), names heard the way a speech
 * model writes them ("Imangachi" is Iman Gadzhi), and amounts read the way they're said or
 * printed ("200 tusind kroner" is "kr. 203.412,00", near enough).
 */

/** Letters and digits only, lowercase, Nordic letters spelt out as a caption reader gives them. */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ|ä/g, "ae")
    .replace(/ø|ö/g, "o")
    .replace(/å/g, "a")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

/** How a name sounds, roughly: spellings that sound alike come out alike ("Gadzhi", "Gadji", "Gatchi"). */
export function soundKey(s: string): string {
  return fold(s)
    .replace(/dzh|dz|dj|zh|dsch|tch|tsch/g, "j")
    .replace(/sch|sh/g, "s")
    .replace(/ch|ck|q|c(?![eiy])/g, "k")
    .replace(/c/g, "s")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/y/g, "i")
    .replace(/z/g, "s")
    .replace(/([bcdfgklmnprstv])h/g, "$1")
    .replace(/(.)\1+/g, "$1");
}

/** Edit distance, for short strings. */
export function edits(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length + b.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * How alike two sound keys are, 0 to 1 (short ones must match exactly). Below `need`, 0: keys
 * too different in length to reach it aren't compared letter by letter.
 */
export function keysAlike(x: string, y: string, need = 0): number {
  if (!x || !y) return 0;
  if (Math.min(x.length, y.length) <= 3) return x === y ? 1 : 0;
  const m = Math.max(x.length, y.length);
  if (1 - Math.abs(x.length - y.length) / m < need) return 0;
  const sim = 1 - edits(x, y) / m;
  return sim >= need ? sim : 0;
}

/** How alike two names sound, 0 to 1 (the same, spelt differently, comes near 1; short names must match exactly). */
export function soundsLike(a: string, b: string): number {
  return keysAlike(soundKey(a), soundKey(b));
}

/** A name to listen for: how it sounds, how many words it is, and how alike a hearing of it must sound. */
export interface Listen {
  name: string;
  key: string;
  words: number;
  need: number;
}
export const listenFor = (name: string): Listen => ({ name, key: soundKey(name), words: name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length || 1, need: fold(name).length >= 7 ? 0.75 : 0.9 });

/** How a text's runs of words sound: keys[span][i] is words i to i + span - 1 (spans 1 to `most`). */
export function windowKeys(words: string[], most = 4): string[][] {
  const out: string[][] = [[]];
  for (let span = 1; span <= most; span++) out.push(words.map((_, i) => (i + span <= words.length ? soundKey(words.slice(i, i + span).join(" ")) : "")));
  return out;
}

/** A name heard at word i (over one word fewer to one more than it has, as a speech model splits and joins names): how alike, over how many words. */
export function heardAt(keys: string[][], n: Listen, i: number): { sim: number; span: number } {
  let best = { sim: 0, span: 0 };
  for (let span = Math.max(1, n.words - 1); span <= n.words + 1 && span < keys.length; span++) {
    const k = keys[span][i];
    const sim = k ? keysAlike(k, n.key, n.need) : 0;
    if (sim > best.sim) best = { sim, span };
  }
  return best;
}

/**
 * Topics, as bits of words: a word speaks of a topic when it starts with one of its bits
 * (or, for a bit written "=word", is that word).
 */
export const CONCEPTS: Record<string, string[]> = {
  money: ["=kr", "kroner", "krone", "=dkk", "=sek", "=nok", "penge", "pengar", "dollar", "=usd", "euro", "=eur", "profit", "overskud", "tjent", "tjene", "tjener", "indtjen", "million", "=mio", "tusind", "tusen", "thousand", "revenue", "income", "indkomst", "cash", "money", "formue", "betaling", "payment", "stripe", "paypal", "mobilepay", "klarna", "=rig", "=rich", "rigdom"],
  sales: ["solgt", "salg", "saelg", "sold", "sell", "sale", "omsaet", "omsat", "omsatt", "ordre", "order", "gross", "brutto"],
  ecommerce: ["webshop", "netbutik", "nettbutik", "onlinebutik", "=shop", "butik", "ecom", "dropship", "shopify", "amazon", "=fba", "produkt", "product", "=vare", "varer", "lager", "fragt", "tiktokshop", "etsy", "=ebay", "woocommerce", "branding", "brand"],
  agency: ["agency", "agencies", "agentur", "bureau", "=byra", "smma", "marketing", "markedsfor", "annonce", "=ads", "leadgen", "leads", "outreach", "klient", "client", "freelanc", "arbitrag", "kunde"],
  trading: ["trading", "trade", "trader", "aktie", "stock", "forex", "krypto", "crypto", "bitcoin", "=btc", "invest", "binance", "coinbase", "chart"],
  schemes: ["trading", "dropship", "=fba", "forex", "krypto", "crypto", "=nft", "passiv", "passive", "hurtigepenge", "quickmoney", "getrich", "blivrig", "bliverrig", "rignatten", "=scam", "svindel", "virkerikke", "busin"],
  gurus: ["guru", "idiot", "fake", "=scam", "svindel", "hustle", "matrix", "topg", "influencer", "=coach", "coaches", "mentor", "blivrig", "bliverrig", "rignatten", "getrich"],
  course: ["kursus", "kurser", "=kurs", "course", "mentor", "coaching", "=coach", "program", "undervis", "laer", "learn", "community", "skool", "masterclass", "forlob", "bootcamp", "uddannels", "utbildning", "undervisning", "modul"],
  results: ["elev", "student", "resultat", "result", "hjulpet", "hjalp", "hjaelp", "succes", "success", "testimonial", "anmeldelse", "review", "forstemaned", "forstemaaned", "rekord", "record"],
  luxury: ["lambo", "lamborghini", "ferrari", "porsche", "mercedes", "=bmw", "=bil", "biler", "bilen", "supercar", "rolex", "=ur", "=uret", "watch", "villa", "penthouse", "yacht", "=bad", "=jet", "privatfly", "luksus", "luxury", "luxus", "=g63", "bugatti", "mclaren"],
  travel: ["rejse", "rejs", "=resa", "travel", "ferie", "dubai", "=usa", "amerika", "america", "bali", "thailand", "london", "miami", "mallorca", "strand", "beach", "hotel", "=fly", "flyet", "lufthavn", "airport", "verden", "world"],
  social: ["tiktok", "instagram", "=insta", "youtube", "facebook", "snapchat", "=reel", "reels", "video", "content", "folger", "follower", "=views", "visning", "algoritm", "viral", "creator", "=ugc"],
  freedom: ["frihed", "frihet", "freedom", "hvorjegvil", "hvornarjegvil", "hvorduvil", "=chef", "boss", "=job", "9til5", "ninetofive", "arbejd", "arbete", "work"],
  school: ["skole", "skolen", "school", "gymnasi", "universitet", "university", "=hf", "=stx", "uddannelse", "studie", "studer"],
  events: ["event", "=fest", "festen", "party", "jagpart", "yachtpart", "netvaerk", "network", "meetup", "konferenc", "mingle", "sammen"],
  business: ["virksomhed", "firma", "foretag", "business", "busin", "startup", "ivaerksaet", "entrepren", "=ceo", "selskab", "company", "forretning", "=aps"],
  fitness: ["=gym", "fitness", "traening", "workout", "muskl", "muscle"],
  tools: ["chatgpt", "=ai", "openai", "canva", "capcut", "automat", "software", "=app", "appen"],
};

/** The topics as the page names them. */
export const TOPIC_NAMES: Record<string, string> = {
  money: "money",
  sales: "sales",
  ecommerce: "online shops",
  agency: "agencies",
  trading: "trading",
  schemes: "get-rich schemes",
  gurus: "gurus",
  course: "courses",
  results: "results",
  luxury: "luxury",
  travel: "travel",
  social: "social media",
  freedom: "freedom",
  school: "school",
  events: "events",
  business: "business",
  fitness: "fitness",
  tools: "tools",
};

/** People and brands these ads show, by the ways their names are written, and what they stand for. */
export const ENTITIES: { name: string; also: string[]; concepts: string[] }[] = [
  { name: "Andrew Tate", also: ["tate", "top g", "cobra tate"], concepts: ["gurus", "schemes", "luxury", "course", "money"] },
  { name: "Tristan Tate", also: [], concepts: ["gurus", "luxury", "money"] },
  { name: "Iman Gadzhi", also: ["gadzhi", "iman"], concepts: ["agency", "course", "business", "gurus", "money"] },
  { name: "Alex Hormozi", also: ["hormozi"], concepts: ["business", "course", "fitness", "money"] },
  { name: "Leila Hormozi", also: [], concepts: ["business", "course"] },
  { name: "Tai Lopez", also: [], concepts: ["gurus", "schemes", "course", "luxury"] },
  { name: "Grant Cardone", also: ["cardone"], concepts: ["business", "money", "gurus"] },
  { name: "Gary Vaynerchuk", also: ["gary vee", "garyvee", "vaynerchuk"], concepts: ["social", "business"] },
  { name: "Elon Musk", also: ["musk"], concepts: ["business", "money"] },
  { name: "Jeff Bezos", also: ["bezos"], concepts: ["ecommerce", "business", "money"] },
  { name: "MrBeast", also: ["mr beast", "jimmy donaldson"], concepts: ["social", "money"] },
  { name: "Luke Belmar", also: ["belmar"], concepts: ["gurus", "trading", "schemes", "luxury"] },
  { name: "Dan Bilzerian", also: ["bilzerian"], concepts: ["luxury", "gurus"] },
  { name: "Jordan Welch", also: [], concepts: ["ecommerce", "course", "gurus"] },
  { name: "Sebastian Ghiorghiu", also: ["ghiorghiu"], concepts: ["ecommerce", "course", "gurus"] },
  { name: "Kevin David", also: [], concepts: ["ecommerce", "course", "schemes"] },
  { name: "Charlie Morgan", also: [], concepts: ["agency", "course"] },
  { name: "Russell Brunson", also: ["brunson"], concepts: ["business", "course"] },
  { name: "Patrick Bet-David", also: ["bet david", "pbd"], concepts: ["business"] },
  { name: "Robert Kiyosaki", also: ["kiyosaki"], concepts: ["money", "trading"] },
  { name: "Warren Buffett", also: ["buffett"], concepts: ["trading", "money"] },
  { name: "Hamza", also: ["hamza ahmed"], concepts: ["fitness", "gurus"] },
  { name: "Logan Paul", also: [], concepts: ["social", "schemes"] },
  { name: "Stripe", also: [], concepts: ["money", "sales"] },
  { name: "Shopify", also: [], concepts: ["ecommerce", "sales"] },
  { name: "Amazon", also: ["amazon fba"], concepts: ["ecommerce", "schemes"] },
  { name: "TikTok Shop", also: ["tiktokshop"], concepts: ["ecommerce", "social", "sales"] },
  { name: "TikTok", also: [], concepts: ["social"] },
  { name: "Instagram", also: ["insta"], concepts: ["social"] },
  { name: "YouTube", also: [], concepts: ["social"] },
  { name: "Binance", also: [], concepts: ["trading"] },
  { name: "Coinbase", also: [], concepts: ["trading"] },
  { name: "Bitcoin", also: ["btc"], concepts: ["trading", "schemes"] },
  { name: "Lamborghini", also: ["lambo"], concepts: ["luxury"] },
  { name: "Ferrari", also: [], concepts: ["luxury"] },
  { name: "Rolex", also: [], concepts: ["luxury"] },
  { name: "Dubai", also: [], concepts: ["travel", "luxury"] },
  { name: "Skool", also: [], concepts: ["course"] },
  { name: "Whop", also: [], concepts: ["course", "sales"] },
  { name: "ChatGPT", also: ["openai"], concepts: ["tools"] },
  { name: "Fiverr", also: [], concepts: ["agency"] },
  { name: "Upwork", also: [], concepts: ["agency"] },
  { name: "Klarna", also: [], concepts: ["money"] },
  { name: "PayPal", also: [], concepts: ["money"] },
];

const inWord = (word: string, bit: string) => (bit.startsWith("=") ? word === bit.slice(1) : word.startsWith(bit));

/**
 * A word that starts with a long stem misspelt, as a speech model misspells: a letter off
 * ("arbetrage" for arbitrage, "jegpart" for "jagpart"), two in a long one, or cut a letter short.
 */
function nearStem(w: string, bit: string): boolean {
  if (bit.startsWith("=") || bit.length < 6 || w.length < 6 || w.length < bit.length - 1) return false;
  const n = Math.min(bit.length, w.length);
  return edits(w.slice(0, n), bit.slice(0, n)) <= (n >= 9 ? 2 : 1);
}

const wordTopics = new Map<string, string[]>();

/** The topics a single word speaks of (a figure run into it, as a text reader gives "200tusind", aside). */
export function conceptsOfWord(word: string): string[] {
  const w = fold(word).replace(/^\d+(?=[a-z]{2})/, "");
  if (w.length < 2) return [];
  let hit = wordTopics.get(w);
  if (!hit) {
    hit = Object.entries(CONCEPTS)
      .filter(([, bits]) => bits.some((b) => inWord(w, b)) || bits.some((b) => nearStem(w, b)))
      .map(([k]) => k);
    if (wordTopics.size > 20000) wordTopics.clear();
    wordTopics.set(w, hit);
  }
  return hit;
}

/** The topics a text speaks of: its words', and those of the people and brands named in it. */
export function conceptsOf(text: string): Set<string> {
  return new Set(topicWeights(text).keys());
}

/**
 * The topics a text speaks of, each weighed: 1 for what its own words say; for a person or
 * brand named in it, 1 for what they stand for first (Iman Gadzhi: agencies), 0.5 for the
 * next, 0.35 for the rest.
 */
export function topicWeights(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (c: string, w: number) => out.set(c, Math.max(out.get(c) ?? 0, w));
  for (const w of text.split(/[^\p{L}\p{N}]+/u)) for (const c of conceptsOfWord(w)) add(c, 1);
  for (const e of entitiesIn(text)) e.concepts.forEach((c, i) => add(c, i === 0 ? 1 : i === 1 ? 0.5 : 0.35));
  return out;
}

let named: { e: (typeof ENTITIES)[number]; names: Listen[] }[] | null = null;
/** The people and brands, each with the names to listen for. */
const entityNames = () => (named ??= ENTITIES.map((e) => ({ e, names: [e.name, ...e.also].map(listenFor) })));

/** The people and brands a text names, spelt however (the whole name, or its surname, sounding alike). */
export function entitiesIn(text: string): typeof ENTITIES {
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return [];
  const keys = windowKeys(words);
  return entityNames()
    .filter(({ names }) => names.some((n) => words.some((_, i) => heardAt(keys, n, i).sim > 0)))
    .map(({ e }) => e);
}

// Number words (folded): Danish (its tens counted in scores: halvtreds is 50), Norwegian, Swedish, English.
const ONES: Record<string, number> = {
  ...{ en: 1, et: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10, tyve: 20, tredive: 30, fyrre: 40, halvtreds: 50, tres: 60, halvfjerds: 70, firs: 80, halvfems: 90, hundrede: 100 },
  ...{ tjue: 20, tretti: 30, forti: 40, femti: 50, seksti: 60, sytti: 70, atti: 80, nitti: 90, hundre: 100 },
  ...{ tjugo: 20, trettio: 30, fyrtio: 40, femtio: 50, sextio: 60, sjuttio: 70, attio: 80, nittio: 90, hundra: 100 },
  ...{ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 },
};

/** A number said as a word ("fem", "halvtreds", "twenty"). */
export const isNumberWord = (word: string) => fold(word) in ONES;
const SCALE: Record<string, number> = { tusind: 1e3, tusen: 1e3, thousand: 1e3, k: 1e3, t: 1e3, million: 1e6, millioner: 1e6, millionen: 1e6, mio: 1e6, miljon: 1e6, miljoner: 1e6, millions: 1e6, m: 1e6, mia: 1e9, milliard: 1e9, milliarder: 1e9, billion: 1e9 };

/** A number as printed ("203.412,00", "5,234,000", "40.000", "1.2M") or null. */
function printed(s: string): number | null {
  const m = /^(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/[.,\s]/g, "")) + (m[2] ? Number(`0.${m[2]}`) : 0);
}

/** The amounts in a text, as said ("200 tusind", "fem millioner") or printed ("kr. 203.412,00", "$40K"). */
export function amounts(text: string): number[] {
  const toks = text
    .toLowerCase()
    .replace(/(\d)\s+(?=\d{3}\b)/g, "$1")
    .split(/[^\p{L}\p{N}.,]+/u)
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ""))
    .filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const glued = /^(\d+(?:[.,]\d+)?)(k|m|mio)$/.exec(t);
    let v = glued ? Number(glued[1].replace(",", ".")) * SCALE[glued[2]] : (printed(t) ?? ONES[fold(t)] ?? null);
    if (v === null) continue;
    const next = toks[i + 1];
    if (next && SCALE[next] && !glued) {
      v *= SCALE[next];
      i++;
    }
    if (v >= 100 || (next && SCALE[next])) out.push(v);
  }
  return out;
}

/** Whether two amounts are the same figure, near enough (rounded when said, exact when printed). */
export function sameAmount(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const r = a / b;
  return r > 0.8 && r < 1.25;
}
