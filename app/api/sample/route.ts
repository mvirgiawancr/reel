import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Development only: serves the last brief saved in .cache/ so the brief screen can be inspected
// without spending a Qloo or AI call. The file is gitignored and the route is off in production.
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  try {
    const text = await readFile(join(process.cwd(), ".cache", "last-brief.json"), "utf8");
    return new Response(text, { headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json({ error: "No saved brief in .cache/last-brief.json" }, { status: 404 });
  }
}
