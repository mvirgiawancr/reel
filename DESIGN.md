# Brief: design notes

Direction from Taste Skill (`design-taste-frontend`, app screens), style **achromatic-ledger**, seed 1725838494, light.
Filter: antislop (during). Review pass before delivery: `web-design-guidelines`. Editorial reference for the brief's reading view: `design-references/wired.DESIGN.md` (structure only, nothing copied).

## Why this style
Brief is used in short sessions: describe an audience, read the brief, copy it into a pitch. It reads like a document, so the chrome stays ink and the only colour is on the taste data itself.

## The move (kept intact)
No colour in the chrome. The primary action is near-black, the secondary a grey pill. The one hue goes on the main data element: the affinity bars that back each claim. Everything else is ink and grey.

## Its face
- **Blue pencil.** The one hue is #1d5fbf, the editor's blue pencil on a brief. It marks affinity (how strongly this audience over-indexes on a thing) and the citation markers that link a sentence in the brief to the Qloo entities behind it.
- **Paper ground.** #f4f3f1 instead of #f8f8f8, the stone of a printed brief. Cards stay white.
- Type: Geist only (400/500/700). No mono on the page (antislop); figures use tabular-nums.

## Signature element: the evidence margin
Every claim in the brief carries numbered blue-pencil markers. The right margin lists, for that section, the Qloo entities behind it with their domain and an affinity bar in the one hue. Hover or tap a marker and its entities light up. This is the thing a generic LLM brief cannot show.

## Screens and their one question
- **Home** (`/`): "Who are you designing for?" One large plain-language field, a few starter audiences written as real sentences, optional age and region, one near-black Generate button. Below: briefs made earlier.
- **Brief** (`/brief/[id]`): "What does this audience love, and what should the work feel like?" Title row = the audience in their words; the line under it names the source (Qloo taste graph), domains and when it was made, with Copy as Markdown on the right. Then the brief (two-thirds) with the evidence margin (one-third). Then the full taste ledger: every entity Qloo returned, by domain, sortable by affinity.
- **Agent trace**, inside the Brief screen while it runs: each step the agent takes (signals resolved, domains queried, entities found), so the work is visible while the brief is written.

## Tokens
See `.taste-skill/direction.json`. Changes from the sheet: `--ground: #f4f3f1` (the face), `--chart-3: #1d5fbf` named `--pencil`.
