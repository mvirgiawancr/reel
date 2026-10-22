"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Picker from "@/components/Picker";
import Wall, { type Tile } from "@/components/Wall";
import { shareCard } from "@/lib/share";
import type { AskAnswer, AskEvent, Favourite, Reel, ReelEvent, StepStatus } from "@/lib/types";

const HISTORY_KEY = "reel.history.v1";
type Step = { id: string; label: string; status: StepStatus };

function loadHistory(): Reel[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Player() {
  const [favs, setFavs] = useState<Favourite[]>([]);
  const [phase, setPhase] = useState<"pick" | "rolling" | "reel">("pick");
  const [steps, setSteps] = useState<Step[]>([]);
  const [reel, setReel] = useState<Reel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Reel[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const lastId = favs[favs.length - 1]?.id ?? "";

  // the wall beside the picker shows the world of the latest favourite
  useEffect(() => {
    let live = true;
    fetch(lastId ? `/api/wall?id=${encodeURIComponent(lastId)}` : "/api/wall")
      .then((r) => r.json())
      .then((j) => live && j.tiles?.length && setTiles(j.tiles))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lastId]);

  useEffect(() => {
    setHistory(loadHistory());
    const p = new URLSearchParams(location.search);
    const id = p.get("id");
    const name = p.get("name");
    if (id && name) setFavs([{ id, name, kind: p.get("kind") ?? "", image: p.get("img") ?? undefined }]);
  }, []);

  function keep(r: Reel) {
    const next = [r, ...history.filter((h) => h.madeAt !== r.madeAt)].slice(0, 8);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: the reel still plays */
    }
  }

  async function roll() {
    if (!favs.length) return;
    setError(null);
    setSteps([]);
    setPhase("rolling");
    try {
      const res = await fetch("/api/reel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favourites: favs }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `The request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as ReelEvent;
          if (ev.type === "step")
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === ev.id);
              const s = { id: ev.id, label: ev.label, status: ev.status };
              return i === -1 ? [...prev, s] : prev.map((p, k) => (k === i ? s : p));
            });
          else if (ev.type === "result") {
            keep(ev.reel);
            setReel(ev.reel);
            setPhase("reel");
          } else if (ev.type === "error") throw new Error(ev.message);
        }
        if (done) break;
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase("pick");
    }
  }

  if (phase === "reel" && reel)
    return (
      <ReelView
        reel={reel}
        onAgain={() => {
          setReel(null);
          setPhase("pick");
        }}
      />
    );

  if (phase === "rolling") {
    const done = steps.filter((s) => s.status !== "running").length;
    const left = Math.max(0, 7 - done);
    return (
      <main className="rolling">
        <div className="leader" aria-hidden="true">
          <span className="display">{left || 1}</span>
        </div>
        <h1 className="display">Rolling</h1>
        <ul className="steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.id} data-status={s.status}>
              {s.label}
              {s.status === "running" ? "…" : ""}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="pick">
      <aside className="pick-wall" aria-hidden="true">
        <Wall tiles={tiles} cols={4} />
      </aside>
      <nav className="topbar" aria-label="Main">
        <Link href="/" className="mark">
          Reel
        </Link>
        <Link href="/#how">How it works</Link>
      </nav>
      <h1 className="display pick-title">Pick your five</h1>
      <p className="pick-lede">Anything you love counts: a song, a film, a series, a book, a podcast, a brand. One is enough; five gives a sharper reel.</p>
      <div className="pick-box">
        {favs.length < 5 && (
          <Picker
            label={favs.length ? `Add another (${favs.length} of 5)` : "Your first favourite"}
            placeholder="Search Qloo…"
            exclude={favs.map((f) => f.id)}
            onPick={(f) => setFavs((prev) => (prev.some((p) => p.id === f.id) ? prev : [...prev, f].slice(0, 5)))}
          />
        )}
        <ul className="stubs">
          {favs.map((f) => (
            <li key={f.id}>
              {f.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.image} alt="" width={48} height={64} />
              ) : (
                <span className="noimg" />
              )}
              <span className="nm">{f.name}</span>
              <span className="kd">{f.kind}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFavs((prev) => prev.filter((p) => p.id !== f.id))}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn roll" disabled={!favs.length} onClick={roll}>
          Roll the reel
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <section className="past" aria-labelledby="past-title">
          <h2 className="section-head" id="past-title">
            Your reels
          </h2>
          <ul>
            {history.map((h) => (
              <li key={h.madeAt}>
                <button
                  type="button"
                  onClick={() => {
                    setReel(h);
                    setPhase("reel");
                  }}
                >
                  <span className="display">{h.title}</span>
                  <span>{h.favourites.map((f) => f.name).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/* ---------- the reel ---------- */

function ReelView({ reel, onAgain }: { reel: Reel; onAgain: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const domains = reel.domains.filter((d) => d.picks.length);
  const total = 1 + domains.length + (reel.traits.length ? 1 : 0) + 3;

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [total]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setAt(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      // arrow keys inside the question box move the caret, not the reel
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (e.key === "ArrowRight") go(Math.round(el.scrollLeft / el.clientWidth) + 1);
      if (e.key === "ArrowLeft") go(Math.round(el.scrollLeft / el.clientWidth) - 1);
    };
    addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("scroll", onScroll);
      removeEventListener("keydown", onKey);
    };
  }, [go]);

  const pictures = domains.flatMap((d) => d.picks.slice(0, 3)).filter((p) => p.image);

  return (
    <main className="reel">
      <div className="progress" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} data-on={i <= at} />
        ))}
      </div>
      <div className="reel-bar">
        <button type="button" className="link" onClick={onAgain}>
          New reel
        </button>
        <span className="count">
          {at + 1} / {total}
        </span>
      </div>

      <div className="track" ref={track} tabIndex={0} aria-label="Your reel. Use the arrow keys to move between cards.">
        <section className="card title-card" aria-label="Title">
          <div className="title-wall" aria-hidden="true">
            {pictures.slice(0, 12).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.image} alt="" width={160} height={240} />
            ))}
          </div>
          <div className="title-copy">
            <span className="kicker">Now showing</span>
            <h1 className="display">{reel.title}</h1>
            <p className="logline">{reel.logline}</p>
            <p className="starring">Starring {reel.favourites.map((f) => f.name).join(", ")}</p>
          </div>
        </section>

        {domains.map((d) => {
          const [lead, ...rest] = d.picks;
          return (
            <section className="card domain-card" key={d.type} aria-label={d.label}>
              <div className="domain-word display" aria-hidden="true">
                {d.label}
              </div>
              <figure className="lead">
                {lead.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lead.image} alt={lead.name} width={480} height={720} />
                ) : (
                  <span className="noimg" />
                )}
              </figure>
              <div className="domain-copy">
                <h2 className="display">{lead.name}</h2>
                <p className="aff">
                  Affinity <b>{lead.affinity.toFixed(2)}</b>
                </p>
                {d.caption && <p className="caption">{d.caption}</p>}
                <ul className="also">
                  {rest.slice(0, 4).map((p) => (
                    <li key={p.id}>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" width={64} height={96} loading="lazy" />
                      ) : (
                        <span className="noimg" />
                      )}
                      <span className="nm">{p.name}</span>
                      <span className="a">{p.affinity.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}

        {reel.traits.length > 0 && (
          <section className="card thread-card" aria-label="The thread">
            <h2 className="display">The thread</h2>
            <p className="caption">Themes and moods Qloo tags on your matches, in the order they cross the most cards.</p>
            <ol className="threads">
              {reel.traits.map((t) => (
                <li key={t.name}>
                  <span className="display">{t.name}</span>
                  <span className="n">{t.cards ? `${t.cards} cards, ${t.count} matches` : t.count}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <AskCard reel={reel} />

        <section className="card credits-card" aria-label="End credits">
          <div className="credits" data-playing={at === total - 2}>
            <p className="display credits-head">{reel.title}</p>
            {domains.map((d) => (
              <div key={d.type} className="credit-block">
                <h3>{d.label}</h3>
                {d.picks.map((p) => (
                  <p key={p.id}>
                    <span>{p.name}</span>
                    <span className="a">{p.affinity.toFixed(2)}</span>
                  </p>
                ))}
              </div>
            ))}
            <p className="credits-foot">Taste data from the Qloo taste graph</p>
          </div>
        </section>

        <KeepCard reel={reel} onAgain={onAgain} />
      </div>

      <div className="nav-arrows">
        <button type="button" className="btn ghost" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous card">
          Back
        </button>
        <button type="button" className="btn" onClick={() => go(at + 1)} disabled={at === total - 1} aria-label="Next card">
          Next
        </button>
      </div>
    </main>
  );
}

const EXAMPLES = ["A film for a rainy Sunday", "A gift for a friend with my taste", "Something for a long night drive", "A book to read next"];
const DOMAIN_LABEL: Record<string, string> = { artist: "Music", movie: "Film", tv_show: "TV", book: "Book", podcast: "Podcast", brand: "Brand" };

/** Ask your reel: an agent that chooses its own Qloo calls to answer, from this reel's favourites. */
function AskCard({ reel }: { reel: Reel }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<{ id: string; label: string; detail?: string; status: StepStatus }[]>([]);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 4 || busy) return;
    setQ(text);
    setBusy(true);
    setError(null);
    setAnswer(null);
    setSteps([]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, favourites: reel.favourites, title: reel.title, traits: reel.traits.map((t) => t.name) }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `The request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AskEvent;
          if (ev.type === "step")
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === ev.id);
              const s = { id: ev.id, label: ev.label, detail: ev.detail, status: ev.status };
              return i === -1 ? [...prev, s] : prev.map((p, k) => (k === i ? s : p));
            });
          else if (ev.type === "result") setAnswer(ev.answer);
          else if (ev.type === "error") throw new Error(ev.message);
        }
        if (done) break;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ask-card" aria-label="Ask your reel">
      <div className="ask-side">
        <h2 className="display">Ask your reel</h2>
        <p className="ask-lede">An agent that knows your taste. It picks its own Qloo searches to answer, and only suggests what Qloo returns.</p>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <label htmlFor="ask-q" className="sr-only">
            Your question
          </label>
          <input id="ask-q" name="question" autoComplete="off" maxLength={200} placeholder="What should I watch tonight…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit" disabled={busy || q.trim().length < 4}>
            Ask
          </button>
        </form>
        <div className="ask-examples">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" disabled={busy} onClick={() => ask(x)}>
              {x}
            </button>
          ))}
        </div>
        {steps.length > 0 && (
          <ol className="ask-trace" aria-live="polite" aria-label="What the agent did">
            {steps.map((s) => (
              <li key={s.id} data-status={s.status}>
                <span>
                  {s.label}
                  {s.status === "running" ? "…" : ""}
                </span>
                {s.detail && <span className="d">{s.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="ask-out" aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!answer && !error && <p className="ask-wait">{busy ? "The agent is working through Qloo…" : "Ask something, or try one of the examples."}</p>}
        {answer && (
          <>
            <p className="ask-answer">{answer.answer}</p>
            <ul className="ask-picks">
              {answer.picks.map((p) => (
                <li key={p.id}>
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} width={120} height={180} />
                  ) : (
                    <span className="noimg" />
                  )}
                  <div>
                    <h3 className="display">{p.name}</h3>
                    <p className="meta">
                      {DOMAIN_LABEL[p.domain] ?? p.domain} &middot; affinity {p.affinity.toFixed(2)}
                    </p>
                    <p className="why">{p.why}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="ask-foot">
              {answer.calls} Qloo calls, chosen by the agent. Every pick came back from the taste graph.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function KeepCard({ reel, onAgain }: { reel: Reel; onAgain: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    shareCard(reel)
      .then((b) => {
        if (!live) return;
        if (!b) return setFailed(true);
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [reel]);

  const file = `reel-${reel.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;

  return (
    <section className="card keep-card" aria-label="Keep it">
      <div className="keep-preview">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Your reel card: ${reel.title}`} width={270} height={480} />
        ) : (
          <span className="keep-wait">{failed ? "The card could not be drawn." : "Drawing your card…"}</span>
        )}
      </div>
      <div className="keep-copy">
        <h2 className="display">Keep it</h2>
        <p>A story-sized card of your reel, 1080 by 1920.</p>
        <div className="keep-actions">
          {url && (
            <a className="btn" href={url} download={file}>
              Save the card
            </a>
          )}
          <button type="button" className="btn ghost" onClick={onAgain}>
            Roll another
          </button>
        </div>
      </div>
    </section>
  );
}
