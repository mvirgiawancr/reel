"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Picker from "@/components/Picker";
import Wall, { type Tile } from "@/components/Wall";
import type { Favourite } from "@/lib/types";

const TABS: { domain: string; label: string }[] = [
  { domain: "movie", label: "Film" },
  { domain: "artist", label: "Music" },
  { domain: "tv_show", label: "TV" },
  { domain: "book", label: "Books" },
];

const INDEX = [
  {
    title: "On your reel",
    items: [
      ["Music", "Artists people with your favourites play on repeat."],
      ["Film", "Films with the strongest pull, poster first."],
      ["TV", "Series the same crowd binges."],
      ["Books", "What they read next."],
      ["Podcasts", "What they listen to on the way home."],
      ["Brands", "Labels and shops that share the audience."],
    ],
    sum: "Six cards, one for each part of the Qloo taste graph.",
  },
  {
    title: "On every card",
    items: [
      ["The lead pick", "The single strongest match, shown big."],
      ["Affinity", "Qloo's 0 to 1 score for how strongly your crowd over-indexes on it."],
      ["Runners-up", "Four more, so you can see the shape of it."],
      ["One line", "A sentence on why, written from Qloo's own descriptions."],
      ["The thread", "Tags that turn up across cards, counted."],
    ],
    sum: "A lead, its score, four runners-up and one line about it.",
  },
  {
    title: "Yours to keep",
    items: [
      ["Your taste, named", "Two to four words, like a film title."],
      ["The end credits", "Every match on one rolling page."],
      ["A story-sized card", "1080 by 1920, saved as an image."],
      ["Any five favourites", "Mix a song, a film and a shoe brand if you like."],
    ],
    sum: "A name for your taste and a card you can post.",
  },
];

export default function Landing() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [swapping, setSwapping] = useState(false);
  const [fav, setFav] = useState<Favourite | null>(null);
  const [tab, setTab] = useState("movie");
  const [tip, setTip] = useState("Point at anything in the lists to see what it means.");

  useEffect(() => {
    fetch("/api/wall")
      .then((r) => r.json())
      .then((j) => setTiles(j.tiles ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".rise");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("seen"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -10% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  async function recast(f: Favourite) {
    setFav(f);
    setSwapping(true);
    try {
      const j = await fetch(`/api/wall?id=${encodeURIComponent(f.id)}`).then((r) => r.json());
      if (j.tiles?.length) {
        await new Promise((r) => setTimeout(r, 500));
        setTiles(j.tiles.map((t: Tile) => ({ ...t, seed: f.name })));
      }
    } finally {
      setSwapping(false);
    }
  }

  // The showcase plays back whatever the wall is showing: the visitor's pick, or the first seed.
  const seed = fav?.name ?? tiles[0]?.seed ?? "";
  const ofSeed = useMemo(() => tiles.filter((t) => t.seed === seed), [tiles, seed]);
  const inTab = ofSeed.filter((t) => t.domain === tab).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  const lead = inTab[0];
  const frames = TABS.map((t) => ofSeed.find((x) => x.domain === t.domain)).filter(Boolean) as Tile[];

  const playHref = fav
    ? `/play?${new URLSearchParams({ id: fav.id, name: fav.name, kind: fav.kind, ...(fav.image ? { img: fav.image } : {}) })}`
    : "/play";

  return (
    <>
      <header className="hero">
        <Wall tiles={tiles} swapping={swapping} />
        <nav className="topbar" aria-label="Main">
          <Link href="/" className="mark">
            Reel
          </Link>
          <a href="#how">How it works</a>
          <Link href="/play">Play</Link>
        </nav>
        <h1 className="display">
          <span className="line one">Your taste,</span>
          <span className="line two">on reel</span>
        </h1>
        <div className="ticket">
          <p>Name up to five things you love. Qloo plays back what else you&rsquo;ll love, across music, film, TV, books, podcasts and brands.</p>
          <Picker
            label="Start with one favourite"
            placeholder="A film, a band, a book…"
            onPick={recast}
            action={
              <Link className="btn" href={playHref}>
                Play
              </Link>
            }
          />
          <div className="now" aria-live="polite">
            {swapping ? (
              <>Finding what fans of <b>{fav?.name}</b> also love…</>
            ) : fav ? (
              <>
                Behind this: what people who love <b>{fav.name}</b> also love.
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="display">
              Now showing: your taste &middot; Now showing: your taste &middot;
            </span>
          ))}
        </div>
      </div>

      <section className="showcase" aria-labelledby="showcase-title">
        <div className="plate rise">
          <div className="plate-frame">
            {lead && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lead.image} alt={`${lead.name}, the strongest ${TABS.find((t) => t.domain === tab)?.label.toLowerCase()} match`} width={620} height={620} />
            )}
            {tab === "artist" && lead && <span className="ring" />}
          </div>
        </div>
        <div className="plate-copy rise">
          <div className="tabs" role="group" aria-label="Which card">
            {TABS.map((t) => (
              <button key={t.domain} type="button" aria-pressed={tab === t.domain} onClick={() => setTab(t.domain)}>
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <h2 className="section-head" id="showcase-title">
              {seed ? `If you love ${seed}` : "One card per domain"}
            </h2>
            <h3>{lead?.name ?? "Loading the reel…"}</h3>
            <p className="desc">
              The strongest {TABS.find((t) => t.domain === tab)?.label.toLowerCase()} match in the Qloo taste graph
              {lead?.affinity ? `, at an affinity of ${lead.affinity.toFixed(2)}` : ""}. The runners-up:
            </p>
            <ul className="runners">
              {inTab.slice(1, 5).map((t) => (
                <li key={t.image}>
                  <span>{t.name}</span>
                  <span className="a">{t.affinity?.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cells">
            <Link className="on" href={playHref}>
              Play the full reel
            </Link>
            <a className="off" href="#how">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className="how" id="how" aria-labelledby="how-title">
        <div className="how-col">
          <h2 className="section-head rise" id="how-title">
            Five favourites in, one reel out
          </h2>
          <p className="rise">
            <b>To begin,</b> you name up to five things you love: a song, a film, a book, a shop. Each one is looked up in Qloo, so the reel starts from the
            thing itself and not from a guess about it.
          </p>
          <div className="ev rise">
            <div className="ev-chips">
              {(frames.length ? frames.slice(0, 3) : []).map((t) => (
                <span key={t.image}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.image} alt="" width={26} height={32} />
                  {t.name}
                </span>
              ))}
            </div>
          </div>
          <p className="rise">
            <b>Then,</b> the Qloo taste graph answers one question six times: what do people who love these also love? Each answer comes with an affinity score
            from 0 to 1.
          </p>
          <div className="ev rise">
            <div className="ev-frames">
              {frames.slice(0, 3).map((t) => (
                <figure key={t.image}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.image} alt={t.name} width={180} height={270} loading="lazy" />
                  <figcaption>
                    <span>{t.name}</span>
                    <span>{t.affinity?.toFixed(2)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          <p className="rise">
            <b>After that,</b> a language model reads Qloo&rsquo;s descriptions of your matches and names the taste they share, in a few words, like the title of a
            film.
          </p>
          <div className="ev rise">
            <div className="ev-title">
              <small>Now showing</small>
              <strong>Late trains and paper lanterns</strong>
              <em>An example. Yours is written from your own matches.</em>
            </div>
          </div>
          <p className="rise">
            <b>Finally,</b> the reel plays: a title card, one card per domain, the threads that tie them, and the end credits. The last card saves as a
            story-sized image.
          </p>
        </div>
      </section>

      <section className="index" aria-labelledby="index-title">
        <h2 className="section-head rise" id="index-title">
          What&rsquo;s on the reel
        </h2>
        <div className="index-grid">
          {INDEX.map((g) => (
            <div className="group rise" key={g.title}>
              <h3>{g.title}</h3>
              <ul>
                {g.items.map(([name, what]) => (
                  <li key={name} tabIndex={0} onMouseEnter={() => setTip(what)} onFocus={() => setTip(what)}>
                    {name}
                  </li>
                ))}
              </ul>
              <p className="sum">{g.sum}</p>
            </div>
          ))}
          <p className="tip" aria-live="polite">
            {tip}
          </p>
        </div>
      </section>

      <Link className="cta" href={playHref}>
        <span className="lead">Pick your five. The reel takes about ten seconds to roll.</span>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 36L36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="4" />
        </svg>
        <span className="word display">Play</span>
      </Link>

      <footer className="foot">
        <div className="foot-cols">
          <ul>
            <li>Reel</li>
            <li>
              <Link href="/play">Play your reel</Link>
            </li>
            <li>
              <a href="#how">How it works</a>
            </li>
          </ul>
          <ul>
            <li>Made with</li>
            <li>
              <a href="https://www.qloo.com/" rel="noopener">
                The Qloo taste graph
              </a>
            </li>
            <li>A Gemini model for the words</li>
          </ul>
          <ul>
            <li>Made by</li>
            <li>
              <a href="https://contra.com/mvirgiawancr" rel="noopener">
                Moch Virgiawan
              </a>
            </li>
            <li>Bandung, Indonesia</li>
          </ul>
          <ul>
            <li>Your data</li>
            <li>Favourites go to Qloo to find matches.</li>
            <li>Reels stay in your browser.</li>
          </ul>
        </div>
        <div />
        <div className="foot-word display" aria-hidden="true">
          Reel
        </div>
        <div className="foot-legal">Posters and covers via Qloo, shown to illustrate matches. Built for the Qloo hackathon, 2026.</div>
      </footer>
    </>
  );
}
