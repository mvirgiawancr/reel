import { kindOf } from "@/lib/kinds";
import { searchEntities } from "@/lib/qloo";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });
  try {
    const hits = await searchEntities(q, undefined, 6);
    return Response.json({
      results: hits.map((h) => ({ id: h.id, name: h.name, kind: kindOf(h.types), image: h.image, year: h.year })),
    });
  } catch {
    return Response.json({ results: [], error: "Search is not answering right now." }, { status: 502 });
  }
}
