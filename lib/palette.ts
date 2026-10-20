// Samples a palette from the moodboard's cover art in the browser. Images come through /api/img so the
// canvas is same-origin and readable.

export interface Swatch {
  hex: string;
  name: string;
  share: number; // 0-1 of sampled pixels
}

const SAMPLE = 40; // each image is drawn at 40x40 for sampling

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/img?u=${encodeURIComponent(src)}`;
  });
}

export async function samplePalette(urls: string[], k = 5): Promise<Swatch[]> {
  const imgs = (await Promise.all(urls.slice(0, 12).map(load))).filter((i): i is HTMLImageElement => !!i);
  if (!imgs.length) return [];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const px: [number, number, number][] = [];
  for (const img of imgs) {
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const d = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  }
  return kmeans(px, k);
}

/** Plain k-means in RGB, seeded deterministically across the sorted pixels so the same art gives the same palette. */
function kmeans(px: [number, number, number][], k: number): Swatch[] {
  if (!px.length) return [];
  const sorted = [...px].sort((a, b) => lum(a) - lum(b));
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let assign = new Array<number>(px.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    assign = px.map((p) => nearest(p, centres));
    centres = centres.map((c, j) => {
      const mine = px.filter((_, i) => assign[i] === j);
      if (!mine.length) return c;
      return [0, 1, 2].map((ch) => mine.reduce((s, p) => s + p[ch], 0) / mine.length) as [number, number, number];
    });
  }
  const counts = centres.map((_, j) => assign.filter((a) => a === j).length);
  const swatches = centres
    .map((c, j) => ({ hex: toHex(c), name: describe(c), share: counts[j] / px.length }))
    .filter((s) => s.share > 0.02)
    .sort((a, b) => b.share - a.share);
  // drop near-duplicates
  return swatches.filter((s, i) => !swatches.slice(0, i).some((t) => dist(hexRgb(s.hex), hexRgb(t.hex)) < 28));
}

const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const nearest = (p: number[], cs: number[][]) => cs.reduce((best, c, j) => (dist(p, c) < dist(p, cs[best]) ? j : best), 0);
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** A short honest name for a colour, from its hue, saturation and lightness. */
function describe([r, g, b]: number[]): string {
  const [h, s, l] = hsl(r, g, b);
  const tone = l < 0.18 ? "Near-black" : l > 0.9 ? "Off-white" : null;
  if (tone && s < 0.25) return tone;
  if (s < 0.12) return l < 0.45 ? "Charcoal grey" : l < 0.75 ? "Mid grey" : "Light grey";
  const hue =
    h < 15 || h >= 345 ? "red" : h < 40 ? "orange" : h < 55 ? "ochre" : h < 70 ? "yellow" : h < 160 ? "green" : h < 195 ? "teal" : h < 255 ? "blue" : h < 290 ? "violet" : "pink";
  const light = l < 0.3 ? "Deep" : l < 0.55 ? "Mid" : l < 0.78 ? "Soft" : "Pale";
  const muted = s < 0.35 ? " muted" : "";
  return `${light}${muted} ${hue}`;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
