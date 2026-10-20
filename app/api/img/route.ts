// Same-origin proxy for Qloo cover art, so the browser can sample the palette from the pixels.
// Only images.qloo.com is allowed through.
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("Bad image URL", { status: 400 });
  }
  if (target.protocol !== "https:" || target.hostname !== "images.qloo.com") return new Response("Not allowed", { status: 403 });
  const res = await fetch(target, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res || !res.ok) return new Response("Image unavailable", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
