import { runReel } from "@/lib/reel";
import type { Favourite, ReelEvent } from "@/lib/types";

export const maxDuration = 120;

// Best-effort limit for the public demo: reels per IP per hour, per server instance.
const LIMIT = 12;
const hits = new Map<string, number[]>();

function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT) return false;
  hits.set(ip, [...recent, now]);
  return true;
}

export async function POST(request: Request) {
  if (!process.env.QLOO_API_KEY) return Response.json({ error: "The server is missing its Qloo key." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(ip)) return Response.json({ error: `That's ${LIMIT} reels this hour from your connection. Try again in a bit.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { favourites?: Partial<Favourite>[] };
  const favourites: Favourite[] = (Array.isArray(body.favourites) ? body.favourites : [])
    .filter((f) => typeof f.id === "string" && /^[\w-]{8,64}$/.test(f.id) && typeof f.name === "string")
    .slice(0, 5)
    .map((f) => ({ id: f.id!, name: f.name!.slice(0, 120), kind: String(f.kind ?? "").slice(0, 20), image: typeof f.image === "string" && f.image.startsWith("https://images.qloo.com/") ? f.image : undefined }));
  if (!favourites.length) return Response.json({ error: "Pick at least one favourite." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ReelEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        emit({ type: "result", reel: await runReel(favourites, emit) });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message || "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
