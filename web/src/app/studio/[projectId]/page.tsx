import type { Metadata } from "next";
import { StudioEditor } from "@/components/studio/StudioEditor";

export const metadata: Metadata = {
  title: "Editor — SARUPAK Studio",
};

export default async function StudioProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <StudioEditor projectId={projectId} />;
}
