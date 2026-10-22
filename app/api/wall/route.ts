import { mapLimit } from "@/lib/agent";
import { entityImage, insights, searchEntities } from "@/lib/qloo";
import type { Domain } from "@/lib/types";

// The landing page's moving wall: covers and posters Qloo links to one favourite (before the visitor
// has typed anything, a well-known one picked at random; the CDN keeps that answer for six hours).
const SEEDS = ["Spirited Away", "Phoebe Bridgers", "Hindia", "Little Women", "Frank Ocean"];
const WALL_DOMAINS: Domain[] = ["movie", "artist", "tv_show", "book"];

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  try {
    const seeds = id
      ? [{ id, name: "" }]
      : (await searchEntities(SEEDS[Math.floor(Math.random() * SEEDS.length)], undefined, 1)).map((h) => ({ id: h.id, name: h.name }));
    const jobs = seeds.flatMap((s) => WALL_DOMAINS.map((d) => ({ s, d })));
    const lists = await mapLimit(jobs, 3, ({ s, d }) => insights(d, { tags: [], entities: [s.id], age: [], gender: null }, 12).catch(() => []));
    const seen = new Set<string>();
    const tiles = lists
      .flatMap((list, i) =>
        list.map((x) => ({ name: x.name, image: entityImage(x), domain: jobs[i].d, affinity: Math.round((x.query?.affinity ?? 0) * 1000) / 1000, seed: jobs[i].s.name })),
      )
      .filter((t) => t.image && !seen.has(t.image) && seen.add(t.image));
    return Response.json({ tiles }, { headers: { "Cache-Control": id ? "private, max-age=3600" : "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ tiles: [] }, { status: 502 });
  }
}
