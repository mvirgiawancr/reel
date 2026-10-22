import type { Reel } from "./types";

const W = 1080;
const H = 1920;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // same-origin proxy, so the canvas stays exportable
    img.src = `/api/img?u=${encodeURIComponent(src)}`;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The story-sized card: six lead pictures, the taste's name and the favourites it came from. */
export async function shareCard(reel: Reel): Promise<Blob | null> {
  const root = getComputedStyle(document.documentElement);
  const display = root.getPropertyValue("--font-display").trim() || "Impact";
  const text = root.getPropertyValue("--font-text").trim() || "Georgia";
  await document.fonts.ready;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const bg = "#3d0012";
  const ink = "#ff99d3";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // three by two posters across the top half
  const leads = reel.domains.filter((d) => d.picks[0]?.image).slice(0, 6);
  const imgs = await Promise.all(leads.map((d) => load(d.picks[0].image!)));
  const gap = 12;
  const pw = (W - 4 * gap) / 3;
  const ph = pw * 1.5;
  imgs.forEach((img, i) => {
    const x = gap + (i % 3) * (pw + gap);
    const y = gap + Math.floor(i / 3) * (ph + gap);
    if (img) cover(ctx, img, x, y, pw, ph);
    else {
      ctx.fillStyle = "#4d0519";
      ctx.fillRect(x, y, pw, ph);
    }
  });

  let y = 2 * ph + 3 * gap + 90;
  ctx.fillStyle = ink;
  ctx.font = `400 34px ${text}`;
  ctx.fillText("Now showing", 64, y);
  y += 24;

  ctx.font = `400 168px ${display}`;
  const title = wrap(ctx, reel.title.toUpperCase(), W - 128).slice(0, 3);
  for (const l of title) {
    y += 148;
    ctx.fillText(l, 60, y);
  }

  y += 70;
  ctx.font = `italic 400 40px ${text}`;
  for (const l of wrap(ctx, reel.logline, W - 128).slice(0, 3)) {
    ctx.fillText(l, 64, y);
    y += 50;
  }

  ctx.font = `400 32px ${text}`;
  const starring = wrap(ctx, `Starring ${reel.favourites.map((f) => f.name).join(", ")}`, W - 128).slice(0, 2);
  starring.forEach((l, i) => ctx.fillText(l, 64, H - 150 + i * 42));
  ctx.font = `400 64px ${display}`;
  ctx.fillText("REEL", W - 64 - ctx.measureText("REEL").width, H - 64);
  ctx.font = `400 28px ${text}`;
  ctx.fillText("Taste data from Qloo", 64, H - 64);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}
