"use client";

import { useMemo } from "react";

export type Tile = { name: string; image: string; domain: string; affinity?: number; seed?: string };

/** Columns of covers rolling up and down at different speeds, like end credits. */
// the pink under a picture only shows once it has loaded, so an empty tile stays dark
const lit = (img: HTMLImageElement) => {
  img.classList.add("in");
  img.parentElement?.classList.add("lit");
};

export default function Wall({ tiles, swapping, cols = 8 }: { tiles: Tile[]; swapping?: boolean; cols?: number }) {
  const columns = useMemo(() => {
    const out: Tile[][] = Array.from({ length: cols }, () => []);
    if (!tiles.length) return out;
    // each column needs enough posters to cover two screens' height, so the loop never shows a gap
    const perCol = Math.max(8, Math.ceil(tiles.length / cols));
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < perCol; r++) out[c].push(tiles[(c * 7 + r * 3 + r * cols) % tiles.length]);
    return out;
  }, [tiles, cols]);

  return (
    <div className={swapping ? "wall swapping" : "wall"} aria-hidden="true">
      {columns.map((col, c) => (
        <div key={c} className={c % 2 ? "wall-col down" : "wall-col"} style={{ ["--dur" as string]: `${70 + ((c * 17) % 40)}s` }}>
          {[...col, ...col].map((t, i) => (
            <div className="wall-tile" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.image} alt="" width={200} height={300} ref={(el) => { if (el?.complete && el.naturalWidth) lit(el); }} onLoad={(e) => lit(e.currentTarget)} />
            </div>
          ))}
        </div>
      ))}
      <div className="wall-shade" />
    </div>
  );
}
