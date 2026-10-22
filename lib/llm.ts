import "server-only";

/*
 * Any OpenAI-compatible chat completions endpoint that supports tool calling.
 *   LLM_API_KEY   required
 *   LLM_BASE_URL  default https://api.openai.com/v1
 *   LLM_MODEL     default gpt-4o-mini
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function llmConfigured() {
  const key = process.env.LLM_API_KEY;
  return Boolean(key && key !== "...");
}

export async function chat(
  messages: Message[],
  opts: { tools?: ToolSpec[]; json?: boolean; temperature?: number } = {},
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  // free tiers rate-limit bursts of agent turns: wait and try again on 429 and 503
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2500 * attempt));
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        temperature: opts.temperature ?? 0.4,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status !== 429 && res.status !== 503) break;
  }
  if (!res || !res.ok) throw new Error(`AI request failed (${res?.status ?? "no response"})`);
  const body = await res.json();
  const msg = body.choices?.[0]?.message ?? {};
  return { content: msg.content ?? null, tool_calls: msg.tool_calls };
}

export function parseJson<T>(text: string | null): T {
  const raw = (text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  // models sometimes wrap the object in prose; take the outermost {...}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as T;
}
