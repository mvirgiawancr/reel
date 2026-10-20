import "server-only";
import { chat, parseJson, type Message, type ToolSpec } from "./llm";
import { entityImage, entityNotes, findTags, insights, searchEntities } from "./qloo";
import {
  AGE_BANDS,
  DOMAINS,
  type BriefInput,
  type BriefResult,
  type BriefSection,
  type Domain,
  type DomainResult,
  type Entity,
  type Segment,
  type Signals,
  type StreamEvent,
} from "./types";

type Emit = (e: StreamEvent) => void;

const PER_DOMAIN = 8;
const MAX_TURNS = 8;

const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "find_tags",
      description:
        "Search Qloo's tag catalogue by keyword (genres, cuisines, styles, interests). Returns tag ids with their type.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_entities",
      description:
        "Search Qloo for a named thing (an artist, film, show, book, podcast, brand, place or destination). Use it when the audience description names something specific.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          domain: { type: "string", enum: DOMAINS.map((d) => d.type) },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_signals",
      description: "Finish: the Qloo signals that describe this audience. Call this once you have the ids.",
      parameters: {
        type: "object",
        properties: {
          tag_ids: { type: "array", items: { type: "string" }, description: "1-4 tag ids from find_tags" },
          entity_ids: { type: "array", items: { type: "string" }, description: "0-4 entity ids from search_entities" },
          age: { type: "array", items: { type: "string", enum: AGE_BANDS.map((a) => a.id) } },
          gender: { type: "string", enum: ["female", "male", "any"] },
        },
        required: ["tag_ids", "entity_ids", "age", "gender"],
      },
    },
  },
];

const RESOLVER = `You turn a plain-language description of a target audience into Qloo taste signals.
Use find_tags for the interests, genres, cuisines and styles in the description, and search_entities for anything it names (an artist, a brand, a show).
Prefer specific tags (a music genre, a cuisine, a style) over broad ones. Pick 1-4 tags and 0-4 entities that best describe what this audience loves.
Map any ages and gender the description gives to the allowed values; use the user's explicit choices when they are given.
When you have the ids, call set_signals. Never invent ids: only use ids the tools returned.`;

/** Phase 1: an agent loop that resolves the description into Qloo signals. */
async function resolveSignals(input: BriefInput, emit: Emit): Promise<Signals> {
  const known = new Map<string, { name: string; kind: "tag" | "entity"; domain?: string }>();
  const userLine = [
    `Audience: ${input.audience}`,
    input.age.length ? `Age bands chosen by the user: ${input.age.join(", ")}` : "",
    input.gender ? `Gender chosen by the user: ${input.gender}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const messages: Message[] = [
    { role: "system", content: RESOLVER },
    { role: "user", content: userLine },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await chat(messages, { tools: TOOLS, temperature: 0.2 });
    const calls = reply.tool_calls ?? [];
    if (!calls.length) {
      messages.push({ role: "assistant", content: reply.content ?? "" });
      messages.push({ role: "user", content: "Use the tools, then call set_signals." });
      continue;
    }
    // keep the assistant message exactly as returned (Gemini needs its thought signatures echoed back)
    messages.push({ role: "assistant", content: reply.content, tool_calls: calls });

    for (const call of calls) {
      const args = safeArgs(call.function.arguments);
      const name = call.function.name;
      const stepId = `${name}-${turn}-${call.id}`;

      if (name === "set_signals") {
        const tags = (args.tag_ids as string[] | undefined ?? []).filter((id) => known.get(id)?.kind === "tag");
        const ents = (args.entity_ids as string[] | undefined ?? []).filter((id) => known.get(id)?.kind === "entity");
        const age = (input.age.length ? input.age : ((args.age as string[] | undefined) ?? [])).filter((a) =>
          AGE_BANDS.some((b) => b.id === a),
        ) as Signals["age"];
        const g = input.gender ?? (args.gender === "female" || args.gender === "male" ? args.gender : null);
        if (!tags.length && !ents.length) {
          messages.push({ role: "tool", tool_call_id: call.id, content: "No valid ids. Search first, then call set_signals with ids the tools returned." });
          continue;
        }
        return {
          tags: tags.map((id) => ({ id, name: known.get(id)!.name })),
          entities: ents.map((id) => ({ id, name: known.get(id)!.name, domain: known.get(id)!.domain ?? "" })),
          age,
          gender: g,
        };
      }

      emit({ type: "step", id: stepId, label: name === "find_tags" ? `Looking up tags for “${args.query}”` : `Searching Qloo for “${args.query}”`, status: "running" });
      let content: string;
      try {
        if (name === "find_tags") {
          const tags = await findTags(String(args.query ?? ""));
          tags.forEach((t) => known.set(t.id, { name: t.name, kind: "tag" }));
          content = JSON.stringify(tags.map((t) => ({ id: t.id, name: t.name, type: t.type })));
          emit({ type: "step", id: stepId, label: `Looking up tags for “${args.query}”`, detail: tags.slice(0, 3).map((t) => t.name).join(", ") || "nothing found", status: "done" });
        } else if (name === "search_entities") {
          const domain = DOMAINS.some((d) => d.type === args.domain) ? (args.domain as Domain) : undefined;
          const hits = await searchEntities(String(args.query ?? ""), domain);
          hits.forEach((h) => known.set(h.id, { name: h.name, kind: "entity", domain: h.types[0]?.replace("urn:entity:", "") }));
          content = JSON.stringify(hits);
          emit({ type: "step", id: stepId, label: `Searching Qloo for “${args.query}”`, detail: hits.slice(0, 2).map((h) => h.name).join(", ") || "nothing found", status: "done" });
        } else {
          content = "Unknown tool.";
        }
      } catch (err) {
        content = `Error: ${(err as Error).message}`;
        emit({ type: "step", id: stepId, label: name, detail: (err as Error).message, status: "error" });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("The agent could not settle on taste signals for this description. Try naming a few interests.");
}

function safeArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Phase 2: ask Qloo what this audience also loves, in every domain. */
async function gatherTaste(signals: Signals, emit: Emit): Promise<DomainResult[]> {
  let n = 0;
  const query = { tags: signals.tags.map((t) => t.id), entities: signals.entities.map((e) => e.id), age: signals.age, gender: signals.gender };
  // places first: it is the slowest call, so it overlaps the others
  const order = [...DOMAINS].sort((a, b) => Number(b.type === "place") - Number(a.type === "place"));
  return mapLimit(order, 3, async (d) => {
      const id = `insights-${d.type}`;
      emit({ type: "step", id, label: `Asking Qloo what they love in ${d.label.toLowerCase()}`, status: "running" });
      try {
        const raw = await insights(d.type, query, PER_DOMAIN);
        const entities: Entity[] = raw.map((e) => ({
          ref: "",
          id: e.entity_id,
          name: e.name,
          domain: d.type,
          affinity: round3(e.query?.affinity ?? 0),
          traits: (e.tags ?? []).map((t) => t.name).filter(Boolean).slice(0, 8),
          image: entityImage(e),
          notes: entityNotes(e) || undefined,
        }));
        emit({ type: "step", id, label: `Asking Qloo what they love in ${d.label.toLowerCase()}`, detail: entities.length ? `${entities.length} found, top: ${entities[0].name}` : "nothing found", status: "done" });
        return { type: d.type, label: d.label, average: entities.length ? round3(avg(entities.map((e) => e.affinity))) : null, entities };
      } catch (err) {
        emit({ type: "step", id, label: `Asking Qloo what they love in ${d.label.toLowerCase()}`, detail: (err as Error).message, status: "error" });
        return { type: d.type, label: d.label, average: null, entities: [] as Entity[] };
      }
  }).then((res) => {
    const sorted = DOMAINS.map((d) => res.find((r) => r.type === d.type)!);
    for (const d of sorted) for (const e of d.entities) e.ref = `E${++n}`;
    return sorted;
  });
}

/** Traits shared across domains; a tag carried by nearly every entity of one domain is that domain's label, not a trait. */
function sharedTraits(domains: DomainResult[]) {
  const generic = new Set<string>();
  for (const d of domains) {
    const counts = new Map<string, number>();
    d.entities.forEach((e) => new Set(e.traits).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    counts.forEach((c, t) => d.entities.length >= 3 && c / d.entities.length >= 0.8 && generic.add(t));
  }
  const total = new Map<string, number>();
  domains.forEach((d) => d.entities.forEach((e) => new Set(e.traits).forEach((t) => !generic.has(t) && total.set(t, (total.get(t) ?? 0) + 1))));
  return [...total.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
}

const WRITER = `You are a senior creative strategist writing a creative brief for designers and brand teams.
You get a target audience and what the Qloo taste graph says this audience also loves, across domains, each item with a ref like E12 and an affinity score (0-1, higher means this audience over-indexes on it more strongly).
Write only from that data. Every claim about the audience's taste must cite the refs it rests on, written inline right after the claim as [E3] or [E3, E7]. Never cite a ref that is not in the list, and never name a film, artist, brand or place that is not in the list.
Use the domain averages. Lean on the strongest domains. A domain marked WEAK is one this audience does not over-index on: do not build ideas on it, and mention it at most once, as something to leave out of the work.
Style: plain, specific, warm, no hype words, no em dashes, short sentences. Write for a designer who has to make work tomorrow.
Reply with JSON only, in this shape:
{"who":["paragraph"],"mood":["paragraph"],"tone":["paragraph"],"lines":["3 short sample lines in the tone, no citations"],"imagery":"one paragraph with citations on colour, light, texture and photography, drawn from the descriptions of what they love","collabs":["paragraph"]}
who: 1-2 paragraphs on who they are, through what they love. mood: 1 paragraph on mood and art direction. tone: 1 paragraph on tone of voice. imagery: what the pictures and colours should feel like (the app shows a palette sampled from the cover art of what they love, so do not invent hex codes). collabs: 1 paragraph of concrete collaboration or placement ideas.
Each item may carry Qloo's own description of its aesthetic, tone or fans after a "|". Use those words as evidence for mood, tone and imagery.`;

interface WriterReply {
  who: string[];
  mood: string[];
  tone: string[];
  lines: string[];
  imagery: string;
  collabs: string[];
}

/** Phase 3: write the brief, then keep only citations that point at real Qloo entities. */
async function writeBrief(input: BriefInput, domains: DomainResult[], traits: BriefResult["traits"]) {
  const top = Math.max(...domains.map((d) => d.average ?? 0));
  const lines = domains
    .map((d) => {
      if (d.average === null) return `${d.label}: NO DATA (the lookup failed; say nothing about this domain)`;
      const weak = d.average < top - 0.05;
      const head = `${d.label} (average affinity ${d.average})${weak ? " WEAK" : ""}`;
      const items = d.entities.map(
        (e) => `  ${e.ref} ${e.name} — affinity ${e.affinity}${e.traits.length ? `; ${e.traits.slice(0, 4).join(", ")}` : ""}${e.notes ? ` | ${e.notes}` : ""}`,
      );
      return [head, ...items].join("\n");
    })
    .join("\n");
  const messages: Message[] = [
    { role: "system", content: WRITER },
    {
      role: "user",
      content: `Audience: ${input.audience}

Shared traits across everything: ${traits.map((t) => `${t.name} (${t.count})`).join(", ") || "none"}

What they also love:
${lines}`,
    },
  ];
  let w: WriterReply | null = null;
  for (let attempt = 0; attempt < 2 && !w; attempt++) {
    const reply = await chat(messages, { json: true, temperature: attempt ? 0.3 : 0.6 });
    try {
      w = parseJson<WriterReply>(reply.content);
    } catch {
      messages.push({ role: "assistant", content: reply.content ?? "" });
      messages.push({ role: "user", content: "That was not valid JSON. Reply again with the same brief as one valid JSON object, nothing else." });
    }
  }
  if (!w) throw new Error("The writer returned a broken draft twice. Try again; the taste data is cached, so it will be quick.");
  const refs = new Set(domains.flatMap((d) => d.entities.map((e) => e.ref)));
  const para = (p: string[] | undefined) => (p ?? []).filter(Boolean).map((t) => toSegments(t, refs));
  const sections: BriefSection[] = [
    { key: "who", title: "Who they are", paragraphs: para(w.who) },
    { key: "mood", title: "Mood and art direction", paragraphs: para(w.mood) },
    { key: "tone", title: "Tone of voice", paragraphs: para(w.tone) },
    { key: "palette", title: "Colour and imagery", paragraphs: para(w.imagery ? [w.imagery] : []) },
    { key: "collabs", title: "Collaborations", paragraphs: para(w.collabs) },
  ];
  return { sections, lines: (w.lines ?? []).filter(Boolean).slice(0, 3) };
}

const GENERIC = `You are a creative strategist. Write a short creative brief for the target audience below, from your own general knowledge only.
Reply with JSON only: {"who":"one paragraph","mood":"one paragraph","tone":"one paragraph","collabs":"one paragraph"}. Plain words, no em dashes.`;

/** The comparison: the same brief from the audience sentence alone, with no Qloo data. Failure is not fatal. */
async function writeGeneric(input: BriefInput): Promise<BriefResult["generic"]> {
  try {
    const reply = await chat(
      [
        { role: "system", content: GENERIC },
        { role: "user", content: `Audience: ${input.audience}` },
      ],
      { json: true, temperature: 0.6 },
    );
    const g = parseJson<{ who: string; mood: string; tone: string; collabs: string }>(reply.content);
    return g.who ? { who: g.who, mood: g.mood ?? "", tone: g.tone ?? "", collabs: g.collabs ?? "" } : null;
  } catch {
    return null;
  }
}

/** Split "text [E1, E3] more text" into segments; drop any ref the data does not contain. */
export function toSegments(text: string, refs: Set<string>): Segment[] {
  const out: Segment[] = [];
  const re = /\s*\[((?:E\d+)(?:\s*,\s*E\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cites = m[1].split(",").map((s) => s.trim()).filter((r) => refs.has(r));
    out.push({ text: text.slice(last, m.index), ...(cites.length ? { cites } : {}) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  // Footnote markers sit after punctuation: "rock.[2]" not "rock[2]." so a marker never starts a line.
  for (let i = 0; i < out.length - 1; i++) {
    const p = out[i + 1].text.match(/^[.,;:!?)]+/);
    if (out[i].cites && p) {
      out[i].text += p[0];
      out[i + 1].text = out[i + 1].text.slice(p[0].length);
    }
  }
  return out.filter((s) => s.text || s.cites);
}

export async function runBrief(input: BriefInput, emit: Emit): Promise<BriefResult> {
  emit({ type: "step", id: "resolve", label: "Reading the audience", status: "running" });
  const signals = await resolveSignals(input, emit);
  emit({
    type: "step",
    id: "resolve",
    label: "Reading the audience",
    detail: [...signals.tags.map((t) => t.name), ...signals.entities.map((e) => e.name)].join(", "),
    status: "done",
  });

  emit({ type: "step", id: "generic", label: "Writing a version without Qloo, for comparison", status: "running" });
  const genericP = writeGeneric(input).then((g) => {
    emit({ type: "step", id: "generic", label: "Writing a version without Qloo, for comparison", detail: g ? undefined : "skipped", status: "done" });
    return g;
  });
  const domains = await gatherTaste(signals, emit);
  if (!domains.some((d) => d.entities.length)) throw new Error("Qloo returned nothing for these signals. Try a broader description.");
  const traits = sharedTraits(domains);

  emit({ type: "step", id: "write", label: "Writing the brief from the taste data", status: "running" });
  const written = await writeBrief(input, domains, traits);
  emit({ type: "step", id: "write", label: "Writing the brief from the taste data", status: "done" });

  const generic = await genericP;
  return { audience: input.audience, madeAt: new Date().toISOString(), signals, domains, traits, ...written, generic };
}

/** Run fn over items with at most `limit` in flight, keeping the input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
