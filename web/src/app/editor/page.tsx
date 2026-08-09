import { EditorApp } from "@/components/editor/EditorApp";
import { SiteNav } from "@/components/site/SiteNav";

export default function EditorPage() {
  return (
    <div className="tool-shell">
      <SiteNav />
      <EditorApp />
    </div>
  );
}
