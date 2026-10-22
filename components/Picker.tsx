"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Favourite } from "@/lib/types";

type Hit = Favourite & { year?: string };

/** A search box over the Qloo catalogue: type a name, pick the right one. */
export default function Picker({
  label,
  placeholder,
  onPick,
  action,
  exclude = [],
}: {
  label: string;
  placeholder: string;
  onPick: (f: Favourite) => void;
  action?: React.ReactNode;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const listId = useId();
  const inputId = useId();
  const last = useRef("");
  const skip = exclude.join(",");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      last.current = term;
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = await res.json();
        if (last.current !== term) return;
        setHits((j.results ?? []).filter((h: Hit) => !skip.split(",").includes(h.id)));
        setError(j.error ?? null);
        setCursor(-1);
        setOpen(true);
      } catch {
        setError("Search is not answering right now.");
      } finally {
        setBusy(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [q, skip]);

  function pick(h: Hit) {
    onPick({ id: h.id, name: h.name, kind: h.kind, image: h.image });
    setQ("");
    setHits([]);
    setOpen(false);
  }

  const showList = open && q.trim().length >= 2 && (hits.length > 0 || !busy);

  return (
    <div className="picker">
      <label htmlFor={inputId}>{label}</label>
      <div className="picker-row">
        <input
          id={inputId}
          name="favourite"
          type="text"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(hits.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && hits.length) {
              e.preventDefault();
              pick(hits[Math.max(0, cursor)]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {action}
      </div>
      {showList && (
        <ul className="suggest" id={listId} role="listbox" aria-label="Matches from Qloo">
          {hits.map((h, i) => (
            <li key={h.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === cursor}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
              >
                {h.image ? <img src={h.image} alt="" width={36} height={48} /> : <span className="noimg" />}
                <span className="nm">
                  {h.name}
                  {h.year ? ` (${h.year})` : ""}
                </span>
                <span className="kd">{h.kind}</span>
              </button>
            </li>
          ))}
          {!busy && hits.length === 0 && <li className="note">{error ?? "Qloo doesn't know that one. Try the full title or name."}</li>}
        </ul>
      )}
    </div>
  );
}
