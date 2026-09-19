import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline — SARUPAK",
};

export default function OfflinePage() {
  return (
    <main className="studio-shell">
      <h1>You are offline</h1>
      <p className="studio-lead">
        The app shell may still open. AI processing, uploads, and cloud sync
        need a network connection.
      </p>
      <Link href="/studio">Try Studio</Link>
    </main>
  );
}
