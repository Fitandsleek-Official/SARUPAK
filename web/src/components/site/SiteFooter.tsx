import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="site-logo">
          SARUPAK
        </Link>
        <p>AI creative studio — owned stack · browser + Hugging Face ready</p>
      </div>
    </footer>
  );
}
