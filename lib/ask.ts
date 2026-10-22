import "server-only";
import { chat, type Message, type ToolSpec } from "./llm";
import { entityImage, entityNotes, findTags, insights, searchEntities } from "./qloo";
import { DOMAINS, type AskAnswer, type AskEvent, type AskPick, type Domain, type Favourite } from "./types";

type Emit = (e: AskEvent) => void;

const MAX_TURNS = 7;
const DOMAIN_IDS = DOMAINS.map((d) => d.type);
const LABEL = Object.fromEntries(DOMAINS.map((d) => [d.type, d.label])) as Record<Domain, string>;

const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "find_tags",
      description:
        "Search Qloo's tag catalogue for a mood, theme, genre, occasion or style (rainy, cozy, road trip, heartbreak). Give the domain so you get tags that apply to it. Returns tag ids.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, domain: { type: "string", enum: DOMAIN_IDS } },
        required: ["query", "domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_entities",
      description: "Look up a specific named thing the question mentions (a film, artist, book, brand) to get its Qloo id.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, domain: { type: "string", enum: DOMAIN_IDS } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_matches",
      description:
        "Ask the Qloo taste graph what people who love this person's favourites also love, in one domain. Optionally steer with tag ids: mode 'lean' nudges results towards the tags, mode 'must' keeps only results that carry them. Optionally add entity ids from search_entities as extra signals. Returns matches with affinity (0-1), Qloo tags and Qloo's own description.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", enum: DOMAIN_IDS },
          tag_ids: { type: "array", items: { type: "string" } },
          tag_mode: { type: "string", enum: ["lean", "must"] },
          extra_entity_ids: { type: "array", items: { type: "string" } },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "answer",
      description: "Finish: answer the question with 2 to 6 picks chosen from get_matches results.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "One or two sentences, second person, answering the question." },
          picks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "an id returned by get_matches" },
                why: { type: "string", description: "at most 14 words, from Qloo's tags and description of this pick" },
              },
              required: ["id", "why"],
            },
          },
        },
        required: ["text", "picks"],
      },
    },
  },
];

const SYSTEM = `You are the agent inside Reel. A person made a reel from their favourites, and the Qloo taste graph knows what people who love those favourites also love. Now they ask you something.
Their favourites are already passed to get_matches as signals; never search for them.
1. Decide which domain or domains the question needs (a gift is often a brand or a book; "for the commute" is a podcast or music).
2. Turn the mood, occasion or theme of the QUESTION into Qloo tags with find_tags, one or two words per query (for "a rainy Sunday": cozy, comforting, heartwarming, slow). The reel's own themes are background, not the request.
3. Call get_matches with those tags. Use tag_mode "must" when the question names a mood or genre the picks have to have, otherwise "lean".
4. Read the tags and descriptions that come back. If picks clash with the request (horror for a cozy afternoon), call get_matches again with other tags or "must".
5. Call answer with 3 to 5 picks that truly fit, and a one or two sentence text.
Use only ids that get_matches returned, and say why each fits from its Qloo tags and description. Never invent a title or an id.
Style: warm, specific, plain. No hype words, no em dashes.`;

interface Known {
  id: string;
  name: string;
  domain: Domain;
  affinity: number;
  image?: string;
}

export async function askReel(favourites: Favourite[], context: { title: string; traits: string[] }, question: string, emit: Emit): Promise<AskAnswer> {
  const favIds = favourites.map((f) => f.id);
  const tagNames = new Map<string, string>();
  const entityNames = new Map<string, string>();
  const matches = new Map<string, Known>();
  let calls = 0;

  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Their favourites: ${favourites.map((f) => `${f.name} (${f.kind})`).join(", ")}
Their reel is titled "${context.title}"; the themes that run through it: ${context.traits.join(", ") || "none listed"}.
Question: ${question}`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await chat(messages, { tools: TOOLS, temperature: 0.3 });
    const toolCalls = reply.tool_calls ?? [];
    if (!toolCalls.length) {
      messages.push({ role: "assistant", content: reply.content ?? "" });
      messages.push({ role: "user", content: "Use the tools: get_matches first, then answer." });
      continue;
    }
    // keep the assistant message exactly as returned (Gemini needs its thought signatures echoed back)
    messages.push({ role: "assistant", content: reply.content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const args = safeArgs(call.function.arguments);
      const name = call.function.name;
      const id = `${name}-${turn}-${call.id}`;
      let content = "";

      if (name === "answer") {
        const seen = new Set<string>();
        const picks: AskPick[] = ((args.picks as { id?: string; why?: string }[] | undefined) ?? [])
          .filter((p) => p.id && matches.has(p.id) && !seen.has(p.id) && !!seen.add(p.id))
          .slice(0, 6)
          .map((p) => ({ ...matches.get(p.id!)!, why: clean(String(p.why ?? "")) }));
        const text = clean(String(args.text ?? ""));
        if (picks.length < 2 || !text) {
          messages.push({ role: "tool", tool_call_id: call.id, content: "Give a one or two sentence text and at least two picks, using ids that get_matches returned." });
          continue;
        }
        return { question, answer: text, picks, calls };
      }

      try {
        const domain = DOMAIN_IDS.includes(args.domain as Domain) ? (args.domain as Domain) : undefined;
        if (name === "find_tags") {
          const label = `Looking for tags like “${args.query}”${domain ? ` in ${lower(LABEL[domain])}` : ""}`;
          emit({ type: "step", id, label, status: "running" });
          calls++;
          const tags = await findTags(String(args.query ?? ""), domain);
          tags.forEach((t) => tagNames.set(t.id, t.name));
          content = JSON.stringify(tags.map((t) => ({ id: t.id, name: t.name, type: t.type })));
          emit({ type: "step", id, label, detail: tags.slice(0, 4).map((t) => t.name).join(", ") || "nothing found", status: "done" });
        } else if (name === "search_entities") {
          const label = `Searching Qloo for “${args.query}”`;
          emit({ type: "step", id, label, status: "running" });
          calls++;
          const hits = await searchEntities(String(args.query ?? ""), domain, 5);
          hits.forEach((h) => entityNames.set(h.id, h.name));
          content = JSON.stringify(hits.map((h) => ({ id: h.id, name: h.name, types: h.types })));
          emit({ type: "step", id, label, detail: hits.slice(0, 2).map((h) => h.name).join(", ") || "nothing found", status: "done" });
        } else if (name === "get_matches" && domain) {
          const tagIds = ((args.tag_ids as string[] | undefined) ?? []).filter((t) => tagNames.has(t)).slice(0, 3);
          const extra = ((args.extra_entity_ids as string[] | undefined) ?? []).filter((e) => entityNames.has(e)).slice(0, 2);
          const must = args.tag_mode === "must";
          const steer = tagIds.length ? `, ${must ? "only" : "leaning"} ${tagIds.map((t) => tagNames.get(t)).join(", ")}` : "";
          const label = `Asking Qloo for ${lower(LABEL[domain])}${steer}`;
          emit({ type: "step", id, label, status: "running" });
          calls++;
          const found = await insights(
            domain,
            { tags: must ? [] : tagIds, mustTags: must ? tagIds : [], entities: [...favIds, ...extra], age: [], gender: null },
            8,
          );
          const own = new Set(favourites.map((f) => f.name.toLowerCase()));
          const rows = found
            .filter((e) => !own.has(e.name.toLowerCase()))
            .map((e) => {
              const k: Known = { id: e.entity_id, name: e.name, domain, affinity: round3(e.query?.affinity ?? 0), image: entityImage(e) };
              matches.set(k.id, k);
              return { id: k.id, name: k.name, affinity: k.affinity, tags: (e.tags ?? []).slice(0, 8).map((t) => t.name), about: entityNotes(e).slice(0, 180) };
            });
          content = rows.length ? JSON.stringify(rows) : "No matches. Try lean mode, other tags or another domain.";
          emit({ type: "step", id, label, detail: rows.slice(0, 3).map((r) => r.name).join(", ") || "nothing", status: "done" });
        } else {
          content = "Unknown tool or missing domain.";
        }
      } catch (err) {
        content = `Error: ${(err as Error).message}`;
        emit({ type: "step", id, label: name, detail: (err as Error).message, status: "error" });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("The agent ran out of steps before answering. Try asking it more simply.");
}

function safeArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").trim();
const lower = (s: string) => (s === "TV" ? s : s.toLowerCase());
const round3 = (n: number) => Math.round(n * 1000) / 1000;
