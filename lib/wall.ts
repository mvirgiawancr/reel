import "server-only";
import { mapLimit } from "./agent";
import { entityImage, insights, searchEntities } from "./qloo";
import type { Domain } from "./types";

// The landing page's moving wall: covers and posters Qloo links to one favourite (before the visitor
// has typed anything, a well-known one picked at random and kept for six hours).
const SEEDS = ["Spirited Away", "Phoebe Bridgers", "Hindia", "Little Women", "Frank Ocean"];
const WALL_DOMAINS: Domain[] = ["movie", "artist", "tv_show", "book"];

export interface WallTile {
  name: string;
  image: string;
  domain: Domain;
  affinity: number;
  seed: string;
}

export async function getWall(id?: string | null): Promise<WallTile[]> {
  const seeds = id
    ? [{ id, name: "" }]
    : (await searchEntities(SEEDS[Math.floor(Math.random() * SEEDS.length)], undefined, 1)).map((h) => ({ id: h.id, name: h.name }));
  const jobs = seeds.flatMap((s) => WALL_DOMAINS.map((d) => ({ s, d })));
  const lists = await mapLimit(jobs, 3, ({ s, d }) => insights(d, { tags: [], entities: [s.id], age: [], gender: null }, 12).catch(() => []));
  const seen = new Set<string>();
  return lists
    .flatMap((list, i) =>
      list.map((x) => ({ name: x.name, image: entityImage(x) ?? "", domain: jobs[i].d, affinity: Math.round((x.query?.affinity ?? 0) * 1000) / 1000, seed: jobs[i].s.name })),
    )
    .filter((t) => t.image && !seen.has(t.image) && seen.add(t.image));
}
