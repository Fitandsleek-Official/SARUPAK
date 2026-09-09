import type { Metadata } from "next";
import { SiteNav } from "@/components/site/SiteNav";
import { VideoTool } from "@/components/tools/VideoTool";

export const metadata: Metadata = {
  title: "Video Converter — SARUPAK",
  description:
    "Upload, compress, and export High quality video for TikTok 120Hz, Facebook, and other apps.",
};

export default function VideoPage() {
  return (
    <>
      <SiteNav />
      <VideoTool />
    </>
  );
}
