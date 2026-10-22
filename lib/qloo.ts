import "server-only";
import type { AgeBand, Domain, Gender } from "./types";

// Hackathon keys only work against this host; staging and production return 401.
const BASE = "https://hackathon.api.qloo.com";

// Private server-side cache. Qloo responses must never be written into the public repo.
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 1000 * 60 * 60 * 6;

async function get<T>(path: string, params: Record<string, string>, opts: { timeoutMs?: number; attempts?: number } = {}): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is not set");
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;

  // Places can be slow and the hackathon key is rate limited: retry a timeout, a 5xx or a 429, backing off each time.
  let res: Response | null = null;
  const attempts = opts.attempts ?? 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
    try {
      res = await fetch(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(opts.timeoutMs ?? 75_000) });
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      if (attempt === attempts - 1) throw new Error(`Qloo did not answer in time (${(err as Error).name})`);
    }
  }
  if (!res || !res.ok) throw new Error(`Qloo ${path} failed (${res?.status ?? "no response"})`);
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), data });
  return data;
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}

export async function findTags(query: string): Promise<QlooTag[]> {
  const d = await get<{ results?: { tags?: { id?: string; tag_id?: string; name: string; type?: string; subtype?: string }[] } }>(
    "/v2/tags",
    { "filter.query": query, take: "8" },
  );
  return (d.results?.tags ?? [])
    .map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name, type: t.type ?? t.subtype }))
    .filter((t) => t.id);
}

export interface QlooSearchHit {
  id: string;
  name: string;
  types: string[];
  image?: string;
  year?: string;
}

export async function searchEntities(query: string, domain?: Domain, take = 5): Promise<QlooSearchHit[]> {
  const params: Record<string, string> = { query, take: String(take) };
  if (domain) params.types = `urn:entity:${domain}`;
  const d = await get<{ results?: (QlooEntity & { types?: string[] })[] }>("/search", params);
  return (d.results ?? []).map((r) => {
    const p = r.properties ?? {};
    const date = typeof p.release_date === "string" ? p.release_date : typeof p.release_year === "number" ? String(p.release_year) : "";
    return { id: r.entity_id, name: r.name, types: r.types ?? [], image: entityImage(r), year: date.slice(0, 4) || undefined };
  });
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  query?: { affinity?: number };
  tags?: { id?: string; name: string; type?: string }[];
  properties?: Record<string, unknown> & { image?: { url?: string } };
}

// Descriptive properties worth handing to the writer, in order of how much they say about taste.
const NOTE_KEYS = [
  "aesthetic_properties",
  "emotional_tone",
  "emotional_tone_description",
  "adjectives_for_music",
  "creative_and_specific_adjectives_for_music",
  "adjectives_for_fans",
  "audience_identity",
  "aspirational_lifestyle",
  "core_values",
  "genre_description",
  "description",
];

/** A short plain-text summary of an entity's descriptive properties (no more than ~220 characters). */
export function entityNotes(e: QlooEntity): string {
  const props = e.properties ?? {};
  const parts: string[] = [];
  for (const k of NOTE_KEYS) {
    const v = props[k];
    const text = Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4).join(", ") : typeof v === "string" ? v : "";
    if (text) parts.push(text.replace(/\s+/g, " ").trim());
    if (parts.join("; ").length > 220) break;
  }
  const out = parts.join("; ");
  return out.length > 240 ? out.slice(0, 237).replace(/\s\S*$/, "") + "…" : out;
}

export function entityImage(e: QlooEntity): string | undefined {
  const url = e.properties?.image?.url;
  return typeof url === "string" && url.startsWith("https://images.qloo.com/") ? url : undefined;
}

export interface InsightSignals {
  tags: string[];
  entities: string[];
  age: AgeBand[];
  gender: Gender | null;
}

export async function insights(domain: Domain, s: InsightSignals, take = 8): Promise<QlooEntity[]> {
  const params: Record<string, string> = { "filter.type": `urn:entity:${domain}`, take: String(take) };
  if (s.tags.length) params["signal.interests.tags"] = s.tags.join(",");
  if (s.entities.length) params["signal.interests.entities"] = s.entities.join(",");
  if (s.age.length) params["signal.demographics.age"] = s.age.join(",");
  if (s.gender) params["signal.demographics.gender"] = s.gender;
  // Places without a location are slow on the hackathon host: give them one short try instead of holding up the brief.
  const opts = domain === "place" ? { timeoutMs: 40_000, attempts: 1 } : {};
  const d = await get<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", params, opts);
  return d.results?.entities ?? [];
}
