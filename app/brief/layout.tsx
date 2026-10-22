import type { Metadata } from "next";
import "./brief.css";

export const metadata: Metadata = {
  title: "Brief: creative briefs grounded in what your audience loves",
};

export default function BriefLayout({ children }: { children: React.ReactNode }) {
  return <div className="brief-app">{children}</div>;
}
