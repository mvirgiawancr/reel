import { askReel } from "@/lib/ask";
import { llmConfigured } from "@/lib/llm";
import type { AskEvent, Favourite } from "@/lib/types";

export const maxDuration = 120;

// Best-effort limit for the public demo: questions per IP per hour, per server instance.
const LIMIT = 30;
const hits = new Map<string, number[]>();

function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT) return false;
  hits.set(ip, [...recent, now]);
  return true;
}

export async function POST(request: Request) {
  if (!process.env.QLOO_API_KEY || !llmConfigured()) return Response.json({ error: "The server is missing its Qloo or AI key." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(ip)) return Response.json({ error: `That's ${LIMIT} questions this hour from your connection. Try again in a bit.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { favourites?: Partial<Favourite>[]; question?: string; title?: string; traits?: string[] };
  const question = String(body.question ?? "").trim().slice(0, 200);
  const favourites: Favourite[] = (Array.isArray(body.favourites) ? body.favourites : [])
    .filter((f) => typeof f.id === "string" && /^[\w-]{8,64}$/.test(f.id) && typeof f.name === "string")
    .slice(0, 5)
    .map((f) => ({ id: f.id!, name: f.name!.slice(0, 120), kind: String(f.kind ?? "").slice(0, 20) }));
  if (question.length < 4) return Response.json({ error: "Ask a question first." }, { status: 400 });
  if (!favourites.length) return Response.json({ error: "This reel has no favourites to work from." }, { status: 400 });
  const context = {
    title: String(body.title ?? "").slice(0, 80),
    traits: (Array.isArray(body.traits) ? body.traits : []).map((t) => String(t).slice(0, 40)).slice(0, 6),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AskEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        emit({ type: "result", answer: await askReel(favourites, context, question, emit) });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message || "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
