"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FEATURES } from "@/lib/features";

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onTool = pathname !== "/";

  return (
    <header className={`site-nav ${onTool ? "site-nav-solid" : ""}`}>
      <div className="site-nav-inner">
        <Link href="/" className="site-logo" onClick={() => setOpen(false)}>
          SARUPAK
        </Link>

        <button
          type="button"
          className="nav-burger"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>

        <nav className={`site-links ${open ? "is-open" : ""}`}>
          {FEATURES.map((f) => (
            <Link
              key={f.id}
              href={f.href}
              className={pathname === f.href ? "is-active" : ""}
              onClick={() => setOpen(false)}
            >
              {f.titleKm}
            </Link>
          ))}
          <Link
            href="/editor"
            className="nav-cta"
            onClick={() => setOpen(false)}
          >
            ចាប់ផ្តើម
          </Link>
        </nav>
      </div>
    </header>
  );
}
