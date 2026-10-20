"use client";

import { useEffect, useMemo, useState } from "react";
import { samplePalette, type Swatch } from "@/lib/palette";
import type { BriefResult, Entity } from "@/lib/types";

const DOMAIN_NAME: Record<string, string> = {
  artist: "Music",
  podcast: "Podcast",
  movie: "Film",
  tv_show: "TV",
  book: "Book",
  brand: "Brand",
  place: "Place",
  destination: "Destination",
};

export default function BriefView({ brief }: { brief: BriefResult }) {
  const [active, setActive] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"qloo" | "plain">("qloo");
  const [palette, setPalette] = useState<Swatch[] | null>(null);

  const all = useMemo(() => brief.domains.flatMap((d) => d.entities), [brief]);
  const byRef = useMemo(() => new Map(all.map((e) => [e.ref, e])), [all]);

  // One marker number per distinct group of cited entities, in reading order.
  const groups = useMemo(() => {
    const list: { n: number; key: string; refs: string[] }[] = [];
    for (const s of brief.sections)
      for (const p of s.paragraphs)
        for (const seg of p)
          if (seg.cites && !list.some((g) => g.key === seg.cites!.join(",")))
            list.push({ n: list.length + 1, key: seg.cites.join(","), refs: seg.cites });
    return list;
  }, [brief]);
  const numberOf = (refs: string[]) => groups.find((g) => g.key === refs.join(","))?.n ?? 0;

  const withData = brief.domains.filter((d) => d.average !== null);
  const strongest = [...withData].sort((a, b) => b.average! - a.average!)[0];
  const weakest = [...withData].sort((a, b) => a.average! - b.average!)[0];
  const empty = brief.domains.filter((d) => d.average === null);

  // Affinity axis: from the nearest 0.05 below the weakest domain to 1.00.
  const lo = Math.max(0, Math.floor(((weakest?.average ?? 0.5) - 0.05) * 20) / 20);
  const ticks = Array.from({ length: Math.round((1 - lo) / 0.05) + 1 }, (_, i) => lo + i * 0.05).filter((_, i, a) => a.length <= 7 || i % 2 === 0);
  const pct = (v: number) => `${(((v - lo) / (1 - lo)) * 100).toFixed(1)}%`;
  const maxTrait = Math.max(1, ...brief.traits.map((t) => t.count));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...all]
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.traits.some((t) => t.toLowerCase().includes(q)) || DOMAIN_NAME[e.domain].toLowerCase().includes(q))
      .sort((a, b) => b.affinity - a.affinity);
  }, [all, query]);

  // Moodboard: the strongest pictures per domain, strongest domains first, nine in all.
  const board = useMemo(() => {
    const ranked = [...brief.domains].filter((d) => d.average !== null).sort((a, b) => b.average! - a.average!);
    const picks: Entity[] = [];
    for (let round = 0; round < 3 && picks.length < 9; round++)
      for (const d of ranked) {
        const withImg = d.entities.filter((e) => e.image);
        if (withImg[round] && picks.length < 9) picks.push(withImg[round]);
      }
    return picks;
  }, [brief]);

  useEffect(() => {
    let live = true;
    setPalette(null);
    samplePalette(board.map((e) => e.image!)).then((p) => live && setPalette(p));
    return () => {
      live = false;
    };
  }, [board]);

  const signalText = [...brief.signals.tags.map((t) => t.name), ...brief.signals.entities.map((e) => e.name)].join(", ");
  const made = new Date(brief.madeAt);

  return (
    <div className="sheet">
      <h1>{brief.audience}</h1>
      <div className="source num">
        Grounded in the Qloo taste graph · {withData.length} domains · {all.length} things this audience loves · made{" "}
        {made.toLocaleDateString(undefined, { day: "numeric", month: "short" })},{" "}
        {made.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </div>

      {board.length > 0 && (
        <div className="mood" aria-label="Moodboard from what this audience loves">
          {board.map((e, i) => (
            <figure key={e.ref} className={i === 0 ? "tile lead" : "tile"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.image} alt={`${e.name}, ${DOMAIN_NAME[e.domain].toLowerCase()} this audience loves`} />
              <figcaption>
                <span className="name">{e.name}</span> <span className="dom">{DOMAIN_NAME[e.domain]}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <div className="label">Signals the agent matched</div>
          <div className="value num">
            {brief.signals.tags.length} tags{brief.signals.entities.length ? ` · ${brief.signals.entities.length} named` : ""}
          </div>
          <div className="note">{signalText || "–"}</div>
        </div>
        <div className="card stat">
          <div className="label">Things they also love</div>
          <div className="value num">{all.length}</div>
          <div className="note num">across {withData.length} of {brief.domains.length} domains</div>
        </div>
        <div className="card stat">
          <div className="label">Strongest pull</div>
          <div className="value">{strongest?.label ?? "–"}</div>
          <div className="note num">{strongest ? `${strongest.average!.toFixed(3)} average affinity` : "–"}</div>
        </div>
        <div className="card stat">
          <div className="label">Weakest pull</div>
          <div className="value">{weakest?.label ?? "–"}</div>
          <div className="note num">
            {weakest ? `${weakest.average!.toFixed(3)}, lean on it least` : "–"}
            {empty.length ? ` · no data: ${empty.map((d) => d.label).join(", ")}` : ""}
          </div>
        </div>
      </div>

      <div className="doc">
        <article className="card brief">
          {brief.generic && (
            <div className="versions" role="tablist" aria-label="Which version of the brief">
              <button role="tab" aria-selected={mode === "qloo"} onClick={() => setMode("qloo")}>
                With Qloo
              </button>
              <button role="tab" aria-selected={mode === "plain"} onClick={() => setMode("plain")}>
                Without Qloo
              </button>
              <span className="versions-note">
                {mode === "qloo"
                  ? "Written from the taste data. Every number links to its evidence."
                  : "The same request to the same model, with only the sentence. Nothing to cite."}
              </span>
            </div>
          )}
          {mode === "plain" && brief.generic ? (
            (
              [
                ["Who they are", brief.generic.who],
                ["Mood and art direction", brief.generic.mood],
                ["Tone of voice", brief.generic.tone],
                ["Collaborations", brief.generic.collabs],
              ] as const
            ).map(([title, text]) => (
              <section key={title}>
                <h2>{title}</h2>
                <p>{text}</p>
              </section>
            ))
          ) : (
          brief.sections
            .filter((s) => s.paragraphs.length)
            .map((s) => (
              <section key={s.key}>
                <h2>{s.title}</h2>
                {s.paragraphs.map((p, i) => (
                  <p key={i}>
                    {p.map((seg, j) => (
                      <span key={j}>
                        {seg.text}
                        {seg.cites && (
                          <button
                            type="button"
                            className="cite num"
                            data-on={active === numberOf(seg.cites)}
                            aria-label={`Evidence ${numberOf(seg.cites)}: ${seg.cites.map((r) => byRef.get(r)?.name).join(", ")}`}
                            onMouseEnter={() => setActive(numberOf(seg.cites!))}
                            onMouseLeave={() => setActive(null)}
                            onFocus={() => setActive(numberOf(seg.cites!))}
                            onBlur={() => setActive(null)}
                            onClick={() => setActive(numberOf(seg.cites!))}
                          >
                            {numberOf(seg.cites)}
                          </button>
                        )}
                      </span>
                    ))}
                  </p>
                ))}
                {s.key === "tone" && brief.lines.length > 0 && (
                  <ul className="lines">
                    {brief.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                {s.key === "palette" && palette && palette.length > 0 && (
                  <>
                    <div className="swatches">
                      {palette.slice(0, 5).map((c) => (
                        <div key={c.hex} className="sw num" style={{ background: c.hex, color: textOn(c.hex) }}>
                          {c.name} {c.hex}
                        </div>
                      ))}
                    </div>
                    <div className="swatch-note">Sampled from the cover art in the moodboard, largest share first.</div>
                  </>
                )}
              </section>
            ))
          )}
        </article>

        <aside className="card evidence" aria-label="Evidence from Qloo">
          <h2>Evidence</h2>
          {mode === "plain" && <p className="empty-note">This version used no data, so there is nothing to show here. Switch back to compare.</p>}
          {mode === "qloo" && groups.length === 0 && <p className="empty-note">The writer cited nothing this time.</p>}
          {mode === "qloo" && groups.flatMap((g) =>
            g.refs.map((r) => {
              const e = byRef.get(r);
              return e ? <Ref key={g.n + r} n={g.n} e={e} on={active === g.n} /> : null;
            }),
          )}
        </aside>
      </div>

      <div className="charts">
        <div className="card chart">
          <h2>Where their taste is strongest</h2>
          <div className="sub">Average Qloo affinity of what this audience loves, per domain</div>
          <div className="bars num">
            {[...brief.domains]
              .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
              .map((d) => (
                <Bar key={d.type} label={d.label} width={d.average === null ? null : pct(d.average)} value={d.average?.toFixed(3) ?? "–"} />
              ))}
          </div>
          <div className="axis num">
            <span />
            <span className="ticks">
              {ticks.map((t) => (
                <span key={t}>{t.toFixed(2)}</span>
              ))}
            </span>
            <span />
          </div>
        </div>
        <div className="card chart">
          <h2>Traits they keep coming back to</h2>
          <div className="sub num">How many of the {all.length} things carry each Qloo tag</div>
          {brief.traits.length === 0 ? (
            <p className="empty-note">No tag appears more than once across domains.</p>
          ) : (
            <>
              <div className="bars num">
                {brief.traits.map((t) => (
                  <Bar key={t.name} label={t.name} width={`${(t.count / maxTrait) * 100}%`} value={String(t.count)} ink />
                ))}
              </div>
              <div className="axis num">
                <span />
                <span className="ticks">
                  {Array.from({ length: maxTrait + 1 }, (_, i) => (
                    <span key={i}>{i}</span>
                  ))}
                </span>
                <span />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card ledger">
        <header>
          <h2 style={{ margin: 0 }}>Everything Qloo returned</h2>
          <input className="search" placeholder={`Search ${all.length} things`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the taste ledger" />
        </header>
        <div className="table-wrap">
          <table className="num">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domain</th>
                <th className="traits">Traits</th>
                <th className="r">Affinity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.ref}>
                  <td>{e.name}</td>
                  <td className="dom">{DOMAIN_NAME[e.domain]}</td>
                  <td className="traits">{e.traits.slice(0, 3).join(", ") || "–"}</td>
                  <td className="r">{e.affinity.toFixed(3)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="dom">
                    Nothing matches “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="foot">Taste data from the Qloo taste graph. Brief text written by an AI model from that data only; check it before you send it to a client.</p>
    </div>
  );
}

function Ref({ n, e, on }: { n: number; e: Entity; on: boolean }) {
  return (
    <div className="ref num" data-on={on}>
      <span className="n">{n}</span>
      <span>
        <span className="name">{e.name}</span> <span className="dom">{DOMAIN_NAME[e.domain]}</span>
      </span>
      <span className="aff">{e.affinity.toFixed(3)}</span>
    </div>
  );
}

function Bar({ label, width, value, ink }: { label: string; width: string | null; value: string; ink?: boolean }) {
  return (
    <>
      <span>{label}</span>
      <span className="track">{width ? <span className={ink ? "fill ink" : "fill"} style={{ width }} /> : <span className="dash">no data</span>}</span>
      <span className="v">{value}</span>
    </>
  );
}

function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#0a0a0a" : "#ffffff";
}
