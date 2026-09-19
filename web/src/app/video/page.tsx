import type { Metadata } from "next";
import { SiteNav } from "@/components/site/SiteNav";
import { VideoTool } from "@/components/tools/VideoTool";

export const metadata: Metadata = {
  title: "Video Converter — SARUPAK",
  description:
    "Esports 120/144 FPS smooth convert, TikTok 120Hz, Facebook — HD to 8K in the browser.",
};

export default function VideoPage() {
  return (
    <>
      <SiteNav />
      <VideoTool />
    </>
  );
}
