"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration may fail on first load / unsupported contexts — non-fatal.
    });
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 1000,
        padding: "8px 12px",
        borderRadius: 8,
        background: "#2a2118",
        color: "#f3efe6",
        fontSize: 13,
        border: "1px solid #5a4632",
      }}
    >
      Offline — project shell may be available; AI processing requires connection.
    </div>
  );
}
