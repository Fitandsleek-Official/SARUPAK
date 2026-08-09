"use client";

import Link from "next/link";
import { type CSSProperties } from "react";
import { FEATURES } from "@/lib/features";

export function HomePage() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-orbit" aria-hidden>
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="orb orb-c" />
          <div className="hero-ring" />
          <div className="hero-ring ring-2" />
          <div className="hero-plane">
            <div className="plane-glow" />
            <div className="plane-photo plane-1" />
            <div className="plane-photo plane-2" />
            <div className="plane-photo plane-3" />
          </div>
        </div>

        <div className="hero-copy">
          <p className="hero-kicker">AI Creative Studio</p>
          <h1 className="hero-brand">SARUPAK</h1>
          <p className="hero-lead">
            កែរូបឆ្លាត — បែងចែកសាច់មនុស្ស · ពណ៌ធម្មជាតិ · ផ្កា ·
            ផ្ទៃក្រោយ ដាច់ពីគ្នា។ Platform សម្រាប់អនាគតនៃ AI media។
          </p>
          <div className="hero-cta">
            <Link href="/editor" className="btn-primary">
              បើក AI Editor
            </Link>
            <Link href="/remove-bg" className="btn-ghost">
              លុប Background
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-head">
          <h2>Features</h2>
          <p>ឧបករណ៍ទាំងអស់ក្នុង studio មួយ — live · beta · soon</p>
        </div>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Link
              key={f.id}
              href={f.href}
              className="feature-tile"
              style={
                {
                  "--tile-accent": f.accent,
                  "--delay": `${i * 0.06}s`,
                } as CSSProperties
              }
            >
              <div className="feature-visual" aria-hidden>
                <span className="feature-orb" />
                <span className="feature-slab" />
              </div>
              <div className="feature-meta">
                <span className={`status-pill status-${f.status}`}>
                  {f.status}
                </span>
                <h3>{f.title}</h3>
                <p className="feature-km">{f.titleKm}</p>
                <p className="feature-blurb">{f.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="smart-section">
        <div className="smart-copy">
          <h2>Regional intelligence</h2>
          <p>
            AI មិនកែរូបទាំងមូលដូចគ្នាទេ។ វាចាប់{" "}
            <strong>skin</strong>, <strong>nature greens</strong>,{" "}
            <strong>flowers</strong>, <strong>sky</strong>, និង{" "}
            <strong>background</strong> រួចគ្រប់គ្រងពណ៌/ពន្លឺដាច់ៗ —
            ជិត Lightroom masks + portrait pro។
          </p>
          <Link href="/editor" className="btn-primary">
            សាក AI Image Editor
          </Link>
        </div>
        <div className="smart-visual" aria-hidden>
          <div className="mask-demo">
            <span className="m-subject">Subject</span>
            <span className="m-skin">Skin</span>
            <span className="m-nature">Nature</span>
            <span className="m-flower">Flower</span>
            <span className="m-bg">Background</span>
          </div>
        </div>
      </section>
    </div>
  );
}
