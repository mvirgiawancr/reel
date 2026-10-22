import Landing from "@/components/Landing";
import { getWall } from "@/lib/wall";

// The wall's posters ship inside the page, so they start loading with the HTML.
export const revalidate = 21600;

export default async function Home() {
  const tiles = await getWall().catch(() => []);
  return <Landing initialTiles={tiles} />;
}
