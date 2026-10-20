import type { BriefResult, Entity } from "./types";

/** The brief as Markdown, with citations turned into footnotes that name the Qloo entities. */
export function toMarkdown(b: BriefResult): string {
  const byRef = new Map<string, Entity>(b.domains.flatMap((d) => d.entities.map((e) => [e.ref, e] as const)));
  const notes: string[] = [];
  const noteOf = new Map<string, number>();
  const cite = (refs: string[]) => {
    const key = refs.join(",");
    if (!noteOf.has(key)) {
      noteOf.set(key, noteOf.size + 1);
      notes.push(
        `[^${noteOf.size}]: ${refs.map((r) => byRef.get(r)).filter(Boolean).map((e) => `${e!.name} (${e!.domain.replace("_", " ")}, affinity ${e!.affinity})`).join("; ")}`,
      );
    }
    return `[^${noteOf.get(key)}]`;
  };

  const out = [`# Creative brief: ${b.audience}`, "", `_Grounded in the Qloo taste graph, ${new Date(b.madeAt).toDateString()}._`, ""];
  for (const s of b.sections) {
    out.push(`## ${s.title}`, "");
    for (const p of s.paragraphs) out.push(p.map((seg) => seg.text + (seg.cites ? cite(seg.cites) : "")).join(""), "");
    if (s.key === "tone" && b.lines.length) out.push(...b.lines.map((l) => `> ${l}`), "");
    if (s.key === "palette" && b.palette.length) out.push(...b.palette.map((c) => `- ${c.name} ${c.hex}`), "");
  }
  out.push("## Where their taste is strongest", "");
  for (const d of b.domains) out.push(`- ${d.label}: ${d.average ?? "no data"}`);
  out.push("", ...notes, "");
  return out.join("\n");
}
