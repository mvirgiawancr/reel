import type { Metadata } from "next";
import Player from "@/components/Player";

export const metadata: Metadata = { title: "Play your reel · Reel" };

export default function PlayPage() {
  return <Player />;
}
