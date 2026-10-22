import { getWall } from "@/lib/wall";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  try {
    const tiles = await getWall(id);
    return Response.json({ tiles }, { headers: { "Cache-Control": id ? "private, max-age=3600" : "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ tiles: [] }, { status: 502 });
  }
}
