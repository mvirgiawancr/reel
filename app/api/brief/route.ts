import { runBrief } from "@/lib/agent";
import { llmConfigured } from "@/lib/llm";
import { AGE_BANDS, type AgeBand, type BriefInput, type StreamEvent } from "@/lib/types";

export const maxDuration = 300;

// Best-effort limit for the public demo: briefs per IP per hour, per server instance.
const LIMIT = 6;
const hits = new Map<string, number[]>();

function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT) return false;
  hits.set(ip, [...recent, now]);
  return true;
}

export async function POST(request: Request) {
  if (!process.env.QLOO_API_KEY || !llmConfigured()) {
    return Response.json({ error: "The server is missing its Qloo or AI key." }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(ip)) {
    return Response.json({ error: `That's ${LIMIT} briefs this hour from your connection. Try again in a bit.` }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<BriefInput>;
  const audience = String(body.audience ?? "").trim().slice(0, 400);
  if (audience.length < 8) return Response.json({ error: "Describe the audience in a sentence." }, { status: 400 });
  const input: BriefInput = {
    audience,
    age: (Array.isArray(body.age) ? body.age : []).filter((a): a is AgeBand => AGE_BANDS.some((b) => b.id === a)),
    gender: body.gender === "female" || body.gender === "male" ? body.gender : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const brief = await runBrief(input, emit);
        emit({ type: "result", brief });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message || "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
