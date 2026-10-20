"use client";

import { useEffect, useState } from "react";
import BriefView from "@/components/BriefView";
import { toMarkdown } from "@/lib/markdown";
import { AGE_BANDS, type AgeBand, type BriefResult, type Gender, type StepStatus, type StreamEvent } from "@/lib/types";

const STARTERS = [
  "Women 25–34 who love specialty coffee and indie folk",
  "Retired couples who travel slowly and cook from farmers markets",
  "Teenage gamers into anime, lo-fi beats and streetwear",
];

const HISTORY_KEY = "brief.history.v1";

type Step = { id: string; label: string; detail?: string; status: StepStatus };
type View = { kind: "home" } | { kind: "running"; audience: string } | { kind: "brief"; brief: BriefResult };

function loadHistory(): BriefResult[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Page() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [audience, setAudience] = useState("");
  const [age, setAge] = useState<AgeBand[]>([]);
  const [gender, setGender] = useState<Gender | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BriefResult[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => setHistory(loadHistory()), []);

  function remember(b: BriefResult) {
    const next = [b, ...history.filter((h) => h.madeAt !== b.madeAt)].slice(0, 8);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: the brief still shows */
    }
  }

  async function generate(text = audience) {
    const a = text.trim();
    if (a.length < 8) {
      setError("Describe the audience in a sentence, for example who they are and two things they love.");
      return;
    }
    setError(null);
    setSteps([]);
    setView({ kind: "running", audience: a });
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: a, age, gender }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `The request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "step") {
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === ev.id);
              const s = { id: ev.id, label: ev.label, detail: ev.detail, status: ev.status };
              return i === -1 ? [...prev, s] : prev.map((p, k) => (k === i ? s : p));
            });
          } else if (ev.type === "result") {
            remember(ev.brief);
            setView({ kind: "brief", brief: ev.brief });
            window.scrollTo(0, 0);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setView({ kind: "home" });
    }
  }

  async function copy(b: BriefResult) {
    try {
      await navigator.clipboard.writeText(toMarkdown(b));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copying was blocked by the browser.");
    }
  }

  const home = () => {
    setView({ kind: "home" });
    window.scrollTo(0, 0);
  };

  return (
    <>
      <div className="bar">
        <button className="mark" onClick={home} aria-label="Brief, back to start">
          <Mark /> Brief
        </button>
        {view.kind !== "home" && (
          <span className="crumb">
            Briefs / <b>{view.kind === "brief" ? view.brief.audience : view.audience}</b>
          </span>
        )}
        <span className="spacer" />
        {view.kind === "brief" && (
          <>
            <button className="btn btn-secondary hide-sm" onClick={() => copy(view.brief)}>
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button className="btn btn-primary" onClick={home}>
              New brief
            </button>
          </>
        )}
      </div>

      {view.kind === "home" && (
        <main className="home">
          <h1>Who are you designing for?</h1>
          <p className="lede">
            Describe an audience in your own words. Brief asks the Qloo taste graph what else they love, across music, film, TV, books,
            podcasts, brands and places, and writes the creative brief from that, with every claim traced to its source.
          </p>

          <form
            className="card ask"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <label htmlFor="audience" className="field-label">
              The audience
            </label>
            <textarea
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Women 25–34 who love specialty coffee and indie folk"
              maxLength={400}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
              }}
            />
            <div className="row">
              <span className="field-label">Age</span>
              <div className="chips" role="group" aria-label="Age bands">
                {AGE_BANDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="chip num"
                    aria-pressed={age.includes(b.id)}
                    onClick={() => setAge((prev) => (prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="field-label">Gender</span>
              <div className="chips" role="group" aria-label="Gender">
                {([null, "female", "male"] as const).map((g) => (
                  <button key={g ?? "any"} type="button" className="chip" aria-pressed={gender === g} onClick={() => setGender(g)}>
                    {g === null ? "Anyone" : g === "female" ? "Women" : "Men"}
                  </button>
                ))}
              </div>
            </div>
            <div className="go">
              <span className="muted">About 30 seconds. Age and gender are optional; the agent reads them from your sentence too.</span>
              <button className="btn btn-primary" type="submit">
                Write the brief
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>

          <div className="starters">
            <h2>Or start from one of these</h2>
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                className="starter"
                onClick={() => {
                  setAudience(s);
                  generate(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="history">
            <h2>Your briefs</h2>
            {history.length === 0 && <p className="empty-note">Briefs you write are kept in this browser and show up here.</p>}
            {history.map((h) => (
              <button key={h.madeAt} type="button" className="past" onClick={() => setView({ kind: "brief", brief: h })}>
                <span>{h.audience}</span>
                <span className="when num">{new Date(h.madeAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </button>
            ))}
          </div>
        </main>
      )}

      {view.kind === "running" && (
        <main className="run" aria-live="polite">
          <h1>{view.audience}</h1>
          <div className="source">The agent is working. Each step below is a real call to the Qloo API or the writer.</div>
          <div className="card trace">
            {steps.length === 0 && (
              <div className="step">
                <span className="glyph running" />
                <span className="label">Starting the agent</span>
              </div>
            )}
            {steps.map((s) => (
              <div className="step" key={s.id}>
                <Glyph status={s.status} />
                <span>
                  <span className="label">{s.label}</span>
                  {s.detail && <div className="detail">{s.detail}</div>}
                </span>
              </div>
            ))}
          </div>
        </main>
      )}

      {view.kind === "brief" && <BriefView brief={view.brief} />}
    </>
  );
}

function Glyph({ status }: { status: StepStatus }) {
  if (status === "running") return <span className="glyph running" aria-label="running" />;
  if (status === "error")
    return (
      <svg className="glyph" viewBox="0 0 16 16" aria-label="failed">
        <circle cx="8" cy="8" r="7" fill="#c4242a" />
        <path d="M8 4.5v4.5M8 11v.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg className="glyph" viewBox="0 0 16 16" aria-label="done">
      <circle cx="8" cy="8" r="7" fill="#141414" />
      <path d="M5 8.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Mark() {
  // a folded brief with a blue-pencil stroke
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 2h9l3 3v13H4z" fill="#141414" />
      <path d="M13 2v3h3" fill="#fff" />
      <path d="M7 9h6M7 12h6M7 15h4" stroke="#fff" strokeWidth="1.4" />
      <path d="M15.5 10.5l-4 4" stroke="#1d5fbf" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
