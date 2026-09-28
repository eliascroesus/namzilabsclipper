/**
 * The shape of a song, bar by bar: how much drum and how loud each bar is, where
 * the song stops for a moment (a break), where a new section starts (the groove
 * changes, the drums drop out or come in, the level steps up or down), and the
 * four-bar phrases inside each section. An editor cuts to this as much as to the
 * beat: a new section is a new picture, a line of the verse lands on a phrase,
 * nothing cuts in the silence of a break, and the shot after it lands on the return.
 */

export interface Bar {
  /** song time of the bar line */
  t: number;
  /** index in the song's beats of the bar's first beat */
  beat: number;
  /** kick, snare/clap and hats, each 0 to 1 against the song's busiest bars */
  kick: number;
  snare: number;
  hats: number;
  /** loudness 0 to 1 (the song's own range) */
  level: number;
  /** drums and level together, 0 to 1: how hard the bar hits */
  energy: number;
  /** how much of the bar has singing in it, 0 to 1 (0 when unknown) */
  vocal: number;
}

export interface Section {
  /** song time of the bar line it opens on */
  t: number;
  /** index of that bar */
  bar: number;
  /** how big the change is, 0 to 1 */
  strength: number;
}

export interface Structure {
  bars: Bar[];
  /** where the song drops out for a beat or more, song times [start, end) */
  breaks: [number, number][];
  /** bar lines where a new section starts */
  sections: Section[];
  /** song times of the first beat of every four-bar phrase, counted from each section */
  phrases: number[];
}

export interface StructureInput {
  beats: number[];
  beatInBar: number[];
  /** loudness over each beat, 0 to 1 */
  beatLoudness: number[];
  /** per beat, the strongest onset in each band near it, 0 to 1 */
  beatKick: number[];
  beatSnare: number[];
  /** per beat, the strongest hi-hat onset on it or on the "and" after it, 0 to 1 */
  beatHats: number[];
  /** per beat, how much of it has singing, 0 to 1 (optional) */
  beatVocal?: number[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

export function songStructure(inp: StructureInput): Structure {
  const { beats, beatInBar, beatLoudness } = inp;
  // Bars from the bar lines (a partial bar before the first one counts as its own).
  const starts: number[] = [];
  for (let i = 0; i < beats.length; i++) if (beatInBar[i] === 0 || i === 0) starts.push(i);
  const refK = Math.max(1e-6, quantile(inp.beatKick, 0.9));
  const refS = Math.max(1e-6, quantile(inp.beatSnare, 0.9));
  const refH = Math.max(1e-6, quantile(inp.beatHats, 0.9));
  const bars: Bar[] = starts.map((b, n) => {
    const e = n + 1 < starts.length ? starts[n + 1] : beats.length;
    const idx = Array.from({ length: e - b }, (_, k) => b + k);
    const kick = Math.min(1, mean(idx.map((i) => inp.beatKick[i])) / refK);
    const snare = Math.min(1, mean(idx.map((i) => inp.beatSnare[i])) / refS);
    const hats = Math.min(1, mean(idx.map((i) => inp.beatHats[i])) / refH);
    const level = mean(idx.map((i) => beatLoudness[i]));
    const vocal = inp.beatVocal ? mean(idx.map((i) => inp.beatVocal![i])) : 0;
    const energy = Math.min(1, 0.5 * level + 0.5 * ((kick + snare + hats) / 3));
    return { t: beats[b], beat: b, kick, snare, hats, level, energy, vocal };
  });

  // Breaks: the song drops out for one to eight beats and comes back: beats near the
  // song's quietest, well below the two beats before them and the four after. (Not a
  // fade-out, and not the gaps in a quiet intro: it has to be going on both sides.)
  const breaks: [number, number][] = [];
  const period = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  const quiet = (k: number) => beatLoudness[k] <= 0.18;
  for (let i = 2; i < beats.length; ) {
    if (!quiet(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < beats.length && quiet(j) && j - i < 9) j++;
    if (j - i <= 8 && j < beats.length) {
      let dip = 0;
      for (let k = i; k < j; k++) dip = Math.max(dip, beatLoudness[k]);
      const before = Math.max(beatLoudness[i - 1], beatLoudness[i - 2]);
      const back: number[] = [];
      for (let k = j; k < Math.min(beats.length, j + 4); k++) back.push(beatLoudness[k]);
      const after = quantile(back, 0.5);
      if (before >= dip + 0.25 && after >= dip + 0.2 && after >= 0.25) breaks.push([beats[i], beats[j]]);
    }
    i = Math.max(j, i + 1);
  }

  // Section starts: the bar lines where the two bars after differ most from the two
  // before (the drums change, the singing starts or stops, the level steps), and the
  // bar a break comes back on.
  const vec = (b: Bar) => [b.kick, b.snare, b.hats, 1.5 * b.level, b.vocal];
  const change: number[] = bars.map((_, n) => {
    if (n < 2 || n + 2 > bars.length) return 0;
    const pre = [bars[n - 2], bars[n - 1]].map(vec);
    const post = [bars[n], bars[n + 1]].map(vec);
    let d = 0;
    for (let k = 0; k < pre[0].length; k++) d += Math.abs((pre[0][k] + pre[1][k]) / 2 - (post[0][k] + post[1][k]) / 2);
    return d;
  });
  const typical = Math.max(1e-6, quantile(change.filter((d) => d > 0), 0.9));
  const sections: Section[] = [];
  for (let n = 0; n < bars.length; n++) {
    const d = change[n];
    const peak = d > 0 && d >= (change[n - 1] ?? 0) && d >= (change[n + 1] ?? 0);
    const afterBreak = breaks.some(([, e]) => Math.abs(e - bars[n].t) < 0.6 * period * 4 && e <= bars[n].t + 0.05) && !sections.some((s) => s.bar === n - 1);
    const strength = Math.min(1, Math.max(d / typical, afterBreak ? 0.8 : 0));
    // Songs move in four-bar phrases: a smaller change off that grid is a fill, not a new section.
    const last = sections.length ? sections[sections.length - 1].bar : 0;
    const onPhrase = (n - last) % 4 === 0;
    if (afterBreak || (peak && d >= 0.6 * typical && (onPhrase || strength >= 0.9))) sections.push({ t: bars[n].t, bar: n, strength });
  }
  // Phrases of four bars, counted from each section start (and from the first bar).
  const phrases: number[] = [];
  const opens = [0, ...sections.map((s) => s.bar)].filter((b, k, a) => a.indexOf(b) === k).sort((a, b) => a - b);
  for (let k = 0; k < opens.length; k++) {
    const end = k + 1 < opens.length ? opens[k + 1] : bars.length;
    for (let b = opens[k]; b < end; b += 4) phrases.push(bars[b].t);
  }
  return { bars, breaks, sections, phrases };
}
