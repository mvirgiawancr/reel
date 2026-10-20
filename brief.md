# Brief: a taste-grounded creative brief agent (Qloo Agentic Hackathon)

Devpost: https://qloo.devpost.com/ · $25k · deadline **Oct 30, 2026** (check exact time on the rules page).
Open to all countries. API key: request form in the developer guide, issued manually in a few business days, so request it first.

## What it does
A freelancer or brand describes a target audience in plain words ("women 20–30 who love specialty coffee and indie folk").
The agent turns that into Qloo signals, asks Qloo what else that audience loves across music, film/TV, books, podcasts, brands, places and destinations, then writes a creative brief grounded in that data:
- audience snapshot (who they are, in their own cultural references)
- mood and art direction, with the references that back it
- tone of voice and a few sample lines
- suggested palette and type mood
- collaboration and placement ideas (brands, venues, podcasts)
- every claim links back to the Qloo entities it came from

Why it needs Qloo: an LLM alone guesses an audience's taste from stereotypes; here every reference comes from the taste graph, with affinity scores the brief can cite.

## Submission requirements
1. Live, publicly hosted app judges can use end to end (no video needed).
2. Public repo with all code and run instructions.
3. Text description: what the agent does and what makes it Qloo-powered.
4. Open-source license, visible in the repo's About section.

## Qloo API notes (from the hackathon developer guide)
- Base URL **https://hackathon.api.qloo.com** only; header `X-Api-Key`. Other base URLs return 401.
- Main endpoint: `GET /v2/insights` (query string params, never a JSON body). `/recs` and `/recommendations` are not allowed.
- Every insights call needs `filter.type`: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game (`urn:entity:...`).
- Signals: `signal.interests.entities` (ids from `/search`), `signal.interests.tags` (ids from `/v2/tags`), `signal.demographics.audiences`, plus demographics like age and gender.
- Invalid params are ignored silently, so empty results usually mean a param is not valid for that `filter.type`. Check the Entity Type Parameter Guide.
- Caching responses server-side is fine. **Never commit Qloo response data to the public repo.**
- Help: Qloo Hackathon Discord, #api-help.

## Build plan (draft)
- Next.js app on Vercel (same stack as Sift), agent loop with tool calling: `qloo_search`, `qloo_tags`, `qloo_insights` tools, then a brief writer.
- LLM provider through env vars (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL), like Sift.
- Show the agent's steps live (which signals it tried, what Qloo returned) so judges see the taste data doing the work.
- Rate limit the public demo.
