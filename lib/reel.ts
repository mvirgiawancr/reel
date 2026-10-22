import "server-only";
import { mapLimit } from "./agent";
import { chat, llmConfigured, parseJson } from "./llm";
import { entityImage, entityNotes, insights, type QlooEntity } from "./qloo";
import { DOMAINS, type Favourite, type Reel, type ReelDomain, type ReelEvent } from "./types";

type Emit = (e: ReelEvent) => void;

const TAKE = 12;
const KEEP = 9;

// Qloo's descriptive tags (themes, style, audience, mood) are the ones that cross domains; genre, format
// and market tags stay inside one and say little about a person.
const DESCRIPTIVE = /:(theme|style|audience|character|plot|emotional_tone|personal_style|motif|music|artist|viewer_characteristic|core_value):qloo$/;

export async function runReel(favourites: Favourite[], emit: Emit): Promise<Reel> {
  const signal = favourites.map((f) => f.id);
  const notes = new Map<string, string>();
  const own = new Set(favourites.map((f) => f.name.toLowerCase()));

  const domains: ReelDomain[] = await mapLimit(DOMAINS, 3, async (d) => {
    emit({ type: "step", id: d.type, label: `Asking Qloo about ${lower(d.label)}`, status: "running" });
    let found: QlooEntity[] = [];
    try {
      found = await insights(d.type, { tags: [], entities: signal, age: [], gender: null }, TAKE);
    } catch {
      emit({ type: "step", id: d.type, label: `No answer on ${lower(d.label)}`, status: "error" });
      return { type: d.type, label: d.label, average: null, picks: [], caption: "" };
    }
    const seen = new Set<string>();
    const picks = found
      .filter((e) => {
        const k = e.name.toLowerCase();
        if (own.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, KEEP)
      .map((e) => {
        notes.set(e.entity_id, entityNotes(e));
        return {
          id: e.entity_id,
          name: e.name,
          affinity: round3(e.query?.affinity ?? 0),
          image: entityImage(e),
          tags: [...new Set((e.tags ?? []).filter((t) => t.type && DESCRIPTIVE.test(t.type)).map((t) => cap(t.name)))].slice(0, 12),
        };
      });
    emit({ type: "step", id: d.type, label: `${picks.length} in ${lower(d.label)}`, status: "done" });
    const average = picks.length ? round3(picks.reduce((a, p) => a + p.affinity, 0) / picks.length) : null;
    return { type: d.type, label: d.label, average, picks, caption: "" };
  });

  const traits = sharedTraits(domains);
  if (!domains.some((d) => d.picks.length)) throw new Error("Qloo had nothing to say about that mix. Try a different favourite.");

  emit({ type: "step", id: "writer", label: "Naming your taste", status: "running" });
  const written = await nameTaste(favourites, domains, traits, notes).catch(() => null);
  emit({ type: "step", id: "writer", label: written ? "Named your taste" : "Named it from the tags", status: "done" });

  const fallbackTitle = traits.slice(0, 2).map((t) => t.name).join(" & ") || "Hard to pin down";
  return {
    favourites,
    madeAt: new Date().toISOString(),
    title: written?.title || fallbackTitle,
    logline: written?.logline || `Built from ${favourites.map((f) => f.name).join(", ")}.`,
    domains: domains.map((d) => ({ ...d, caption: written?.captions?.[d.type] ?? "" })),
    traits,
  };
}

// The thread: descriptive tags that turn up on the most cards, then on the most matches.
function sharedTraits(domains: ReelDomain[]) {
  const total = new Map<string, { count: number; cards: Set<string> }>();
  for (const d of domains)
    for (const p of d.picks)
      for (const t of p.tags) {
        const k = total.get(t) ?? { count: 0, cards: new Set<string>() };
        k.count++;
        k.cards.add(d.type);
        total.set(t, k);
      }
  return [...total.entries()]
    .filter(([, v]) => v.cards.size >= 2)
    .sort((a, b) => b[1].cards.size - a[1].cards.size || b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([name, v]) => ({ name, count: v.count, cards: v.cards.size }));
}

const NAMER = `You name a person's taste from what the Qloo taste graph says they would also love.
You get their favourites and, per domain, the top matches with Qloo's affinity (0-1) and Qloo's own description of each after a "|".
Write only from that data. No hype words, no em dashes, no clichés such as "eclectic", "vibes", "journey" or "curated".
Reply with JSON only:
{"title":"the taste named in 2 to 4 words, specific and a little poetic, like the title of a film, drawn from the images and moods in the data","logline":"one sentence of at most 18 words, second person, about what ties their taste together","captions":{"<domain>":"one line of at most 12 words, second person, about this domain's matches, naming one of them"}}
Give a caption for every domain listed. Invent the title fresh from this data; never reuse a title you have seen in an instruction. Domains listed as WEAK get a gently honest caption.`;

async function nameTaste(favourites: Favourite[], domains: ReelDomain[], traits: Reel["traits"], notes: Map<string, string>) {
  if (!llmConfigured()) return null;
  const top = Math.max(...domains.map((d) => d.average ?? 0));
  const data = domains
    .filter((d) => d.picks.length)
    .map((d) => {
      const weak = (d.average ?? 0) < top - 0.05 ? " WEAK" : "";
      const lines = d.picks.slice(0, 5).map((p) => `  - ${p.name} (${p.affinity}) [${p.tags.slice(0, 6).join(", ")}]${notes.get(p.id) ? ` | ${notes.get(p.id)}` : ""}`);
      return `${d.type} (${d.label}, average ${d.average})${weak}\n${lines.join("\n")}`;
    })
    .join("\n");
  const user = `Favourites: ${favourites.map((f) => `${f.name} (${f.kind})`).join(", ")}\nTraits that recur: ${traits.map((t) => t.name).join(", ") || "none"}\n\n${data}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat(
      [
        { role: "system", content: NAMER },
        { role: "user", content: attempt ? `${user}\n\nYour last reply was not valid JSON. Reply with the JSON object only.` : user },
      ],
      { json: true, temperature: 0.7 },
    );
    try {
      const out = parseJson<{ title?: string; logline?: string; captions?: Record<string, string> }>(res.content);
      if (out.title) return { title: clean(out.title), logline: clean(out.logline ?? ""), captions: Object.fromEntries(Object.entries(out.captions ?? {}).map(([k, v]) => [k, clean(String(v))])) };
    } catch {
      /* one more try */
    }
  }
  return null;
}

const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/^["']|["']$/g, "").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const lower = (s: string) => (s === "TV" ? s : s.toLowerCase());
const round3 = (n: number) => Math.round(n * 1000) / 1000;
