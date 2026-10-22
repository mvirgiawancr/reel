# Reel

**Your taste, played back.** Name up to five things you love (a song, a film, a series, a book, a podcast, a brand) and Reel asks the [Qloo](https://www.qloo.com/) taste graph what else you would love. It plays the answer back as a reel of full-screen cards: a title card naming your taste, one card for each of six domains, the thread that ties them together, rolling end credits, and a story-sized card you can save.

Built for the Qloo Agentic Hackathon, 2026.

## What Qloo does here

Everything on a card comes from Qloo. The language model only names what Qloo found.

| Step | Qloo endpoint | What it gives the reel |
| --- | --- | --- |
| You type a name | `GET /search` | The exact entity (Hindia the band, not the person), with its cover art |
| The reel rolls | `GET /v2/insights` with `signal.interests.entities` set to your favourites, once per domain: `artist`, `movie`, `tv_show`, `book`, `podcast`, `brand` | Up to nine matches per domain with an affinity score from 0 to 1, Qloo's descriptive tags and its own descriptions |
| The thread | Tags on those matches (theme, style, audience, mood) | The themes that turn up on the most cards, counted |
| The landing page | `GET /v2/insights` for one favourite | The moving wall of posters behind the headline; type a favourite and the wall recasts to that world |

Then a language model reads Qloo's descriptions of the strongest matches and writes three things: a two-to-four-word name for the taste, one sentence about it, and one line per card. It is told to write only from that data. If the model is unavailable, the reel still plays, with a name made from the shared tags.

### Ask your reel: the agent

After the reel plays, you can ask it anything: a film for a rainy Sunday, a gift for a friend with your taste, something for a long night drive. An agent (LLM tool calling over an OpenAI-compatible API) answers by choosing its own Qloo calls:

| Tool | Qloo endpoint | What the agent uses it for |
| --- | --- | --- |
| `find_tags` | `GET /v2/tags`, scoped with `filter.parents.types` | Turns the mood or occasion in the question into Qloo tags for the right domain ("rainy Sunday" becomes Cozy, Comforting) |
| `search_entities` | `GET /search` | Looks up anything the question names |
| `get_matches` | `GET /v2/insights` with your favourites as `signal.interests.entities`, plus tags as `signal.interests.tags` (lean) or `filter.tags` (must) | Gets matches in the domain it chose, and tries again with other tags when the first results do not fit |
| `answer` | none | Finishes with 2 to 6 picks; any id that did not come back from `get_matches` is rejected |

Every step the agent takes is shown under the question as it happens, and the answer says how many Qloo calls it made.

## How it is built

- Next.js 16 (App Router), React 19, TypeScript, plain CSS. No UI library.
- `lib/qloo.ts`: the Qloo client, with a small in-memory cache and retry on 429 and 5xx.
- `lib/ask.ts`: the Ask your reel agent loop and its four tools.
- `lib/reel.ts`: the pipeline. Six insights calls run three at a time, the thread is counted, then the model names the taste.
- `app/api/reel`: streams progress as NDJSON, so the countdown shows each real call as it finishes.
- `lib/share.ts`: draws the 1080 by 1920 card on a canvas in the browser, with posters loaded through a same-origin proxy (`app/api/img`, limited to `images.qloo.com`).
- Reels are kept only in your browser (`localStorage`). Qloo responses are cached in server memory and are never written to this repository.

There is also `/brief`, an earlier experiment in the same repo: describe an audience in a sentence and get a creative brief with every claim cited to Qloo entities.

## Run it locally

You need Node 20 or later, a Qloo hackathon API key, and any OpenAI-compatible chat endpoint (the hosted demo uses Gemini through its OpenAI-compatible API).

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

Open http://localhost:3000.

| Variable | What it is |
| --- | --- |
| `QLOO_API_KEY` | Your Qloo hackathon key (sent to `https://hackathon.api.qloo.com`) |
| `LLM_API_KEY` | Key for the chat endpoint |
| `LLM_BASE_URL` | Base URL of an OpenAI-compatible API, for example `https://generativelanguage.googleapis.com/v1beta/openai` |
| `LLM_MODEL` | Model name, for example `gemini-2.5-flash` |

## Credits

Taste data, posters and cover art from the Qloo taste graph, shown to illustrate the matches. Type: Bebas Neue and EB Garamond.

Made by Moch Virgiawan Caesar Ridollohi, Bandung.

## License

[MIT](LICENSE)
