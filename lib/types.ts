export type Domain =
  | "artist"
  | "movie"
  | "tv_show"
  | "book"
  | "podcast"
  | "brand"
  | "place"
  | "destination";

export const DOMAINS: { type: Domain; label: string }[] = [
  { type: "artist", label: "Music" },
  { type: "podcast", label: "Podcasts" },
  { type: "movie", label: "Film" },
  { type: "tv_show", label: "TV" },
  { type: "book", label: "Books" },
  { type: "brand", label: "Brands" },
];
// Places and destinations are left out on purpose: on the hackathon host places time out without a
// location, and destinations returned the same list (Shanghai first, 0.765) for every audience we tried.

export const AGE_BANDS = [
  { id: "24_and_younger", label: "24 and younger" },
  { id: "25_to_29", label: "25–29" },
  { id: "30_to_34", label: "30–34" },
  { id: "35_to_44", label: "35–44" },
  { id: "45_to_54", label: "45–54" },
  { id: "55_and_older", label: "55 and older" },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number]["id"];
export type Gender = "female" | "male";

export interface BriefInput {
  audience: string;
  age: AgeBand[];
  gender: Gender | null;
}

export interface Entity {
  ref: string; // short id the writer cites, e.g. E12
  id: string;
  name: string;
  domain: Domain;
  affinity: number;
  traits: string[];
  image?: string; // https://images.qloo.com/…
  notes?: string; // descriptive properties from Qloo, used by the writer
}

export interface Signals {
  tags: { id: string; name: string }[];
  entities: { id: string; name: string; domain: string }[];
  age: AgeBand[];
  gender: Gender | null;
}

export interface DomainResult {
  type: Domain;
  label: string;
  average: number | null; // null when Qloo returned nothing for this domain
  entities: Entity[];
}

/** A run of text, optionally backed by Qloo entities (by ref). */
export interface Segment {
  text: string;
  cites?: string[];
}

export interface BriefSection {
  key: "who" | "mood" | "tone" | "palette" | "collabs";
  title: string;
  paragraphs: Segment[][];
}

export interface BriefResult {
  audience: string;
  madeAt: string; // ISO
  signals: Signals;
  domains: DomainResult[];
  traits: { name: string; count: number }[];
  sections: BriefSection[];
  lines: string[];
  /** The same brief written from the audience sentence alone, with no Qloo data: the comparison. */
  generic: { who: string; mood: string; tone: string; collabs: string } | null;
}

export type StepStatus = "running" | "done" | "error";

export type StreamEvent =
  | { type: "step"; id: string; label: string; detail?: string; status: StepStatus }
  | { type: "result"; brief: BriefResult }
  | { type: "error"; message: string };

/* ---------- Reel ---------- */

/** Something the visitor loves, as Qloo knows it. */
export interface Favourite {
  id: string;
  name: string;
  kind: string; // "Film", "Music", "Person"…
  image?: string;
}

export interface ReelPick {
  id: string;
  name: string;
  affinity: number;
  image?: string;
  tags: string[];
}

export interface ReelDomain {
  type: Domain;
  label: string;
  average: number | null;
  picks: ReelPick[];
  caption: string; // one line from the writer, or "" when the writer was unavailable
}

export interface Reel {
  favourites: Favourite[];
  madeAt: string;
  title: string; // the taste, named in two to four words
  logline: string;
  domains: ReelDomain[];
  traits: { name: string; count: number }[];
}

export type ReelEvent =
  | { type: "step"; id: string; label: string; status: StepStatus }
  | { type: "result"; reel: Reel }
  | { type: "error"; message: string };
