import type { Metadata } from "next";
import { SiteNav } from "@/components/site/SiteNav";
import { StudioDashboard } from "@/components/studio/StudioDashboard";

export const metadata: Metadata = {
  title: "Studio — SARUPAK",
  description: "AI Video Studio projects, auth, and media foundation.",
};

export default function StudioPage() {
  return (
    <>
      <SiteNav />
      <StudioDashboard />
    </>
  );
}
