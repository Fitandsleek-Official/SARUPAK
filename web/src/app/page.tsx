import { HomePage } from "@/components/home/HomePage";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

export default function Page() {
  return (
    <>
      <SiteNav />
      <HomePage />
      <SiteFooter />
    </>
  );
}
