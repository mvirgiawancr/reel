"use client";

import { useEffect, useMemo, useRef } from "react";

export type Tile = { name: string; image: string; domain: string; affinity?: number; seed?: string };

// Qloo serves each picture at several widths; the wall's tiles are small and dimmed, so 240px is plenty.
export const small = (url: string) => url.replace(/-\d+x-auto\.jpg$/, "-240x-auto.jpg");

/** Columns of covers rolling up and down at different speeds, like end credits. */
export default function Wall({
  tiles,
  swapping,
  cols = 8,
  onProgress,
}: {
  tiles: Tile[];
  swapping?: boolean;
  cols?: number;
  onProgress?: (loaded: number, total: number) => void;
}) {
  const loaded = useRef(new Set<string>());
  const report = useRef(onProgress);
  report.current = onProgress;
  const columns = useMemo(() => {
    const out: Tile[][] = Array.from({ length: cols }, () => []);
    if (!tiles.length) return out;
    // each column needs enough posters to cover two screens' height, so the loop never shows a gap
    const perCol = Math.max(8, Math.ceil(tiles.length / cols));
    // walk the list with a prime stride, so neighbouring tiles never repeat the same poster
    const n = tiles.length;
    const stride = n % 13 ? 13 : 17;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < perCol; r++) out[c].push(tiles[((r * cols + c) * stride + 5) % n]);
    return out;
  }, [tiles, cols]);
  // count only the posters the wall actually shows
  const total = useMemo(() => new Set(columns.flat().map((t) => t.image)).size, [columns]);

  useEffect(() => {
    loaded.current = new Set();
    report.current?.(0, total);
  }, [tiles, total]);

  // the pink under a picture only shows once it has loaded, so an empty tile stays dark
  const lit = (img: HTMLImageElement, src: string) => {
    img.classList.add("in");
    img.parentElement?.classList.add("lit");
    if (!loaded.current.has(src)) {
      loaded.current.add(src);
      report.current?.(loaded.current.size, total);
    }
  };


  return (
    <div className={swapping ? "wall swapping" : "wall"} style={cols === 8 ? undefined : { ["--cols" as string]: cols }} aria-hidden="true">
      {columns.map((col, c) => (
        <div key={c} className={c % 2 ? "wall-col down" : "wall-col"} style={{ ["--dur" as string]: `${70 + ((c * 17) % 40)}s` }}>
          {[...col, ...col].map((t, i) => (
            <div className="wall-tile" key={t.image + i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={small(t.image)}
                alt=""
                width={200}
                height={300}
                fetchPriority={i < 3 ? "high" : "auto"}
                ref={(el) => {
                  if (el?.complete && el.naturalWidth) lit(el, t.image);
                }}
                onLoad={(e) => lit(e.currentTarget, t.image)}
                onError={(e) => lit(e.currentTarget, t.image)}
              />
            </div>
          ))}
        </div>
      ))}
      <div className="wall-shade" />
    </div>
  );
}
