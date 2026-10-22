const KIND: Record<string, string> = {
  artist: "Music",
  movie: "Film",
  tv_show: "TV",
  book: "Book",
  podcast: "Podcast",
  brand: "Brand",
  person: "Person",
  place: "Place",
  destination: "Destination",
  videogame: "Game",
  video_game: "Game",
  album: "Album",
};

/** "urn:entity:tv_show" → "TV" */
export function kindOf(types: string[]): string {
  for (const t of types) {
    const k = KIND[t.replace("urn:entity:", "")];
    if (k) return k;
  }
  return "Other";
}
