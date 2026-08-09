export type FeatureId =
  | "editor"
  | "remove-bg"
  | "collage"
  | "generate"
  | "video"
  | "face-swap";

export interface Feature {
  id: FeatureId;
  href: string;
  title: string;
  titleKm: string;
  blurb: string;
  status: "live" | "beta" | "soon";
  accent: string;
}

export const FEATURES: Feature[] = [
  {
    id: "editor",
    href: "/editor",
    title: "AI Image Editor",
    titleKm: "កែរូប AI",
    blurb: "បែងចែក skin · nature · ផ្កា · background រួចកែលម្អិត",
    status: "live",
    accent: "#e8a045",
  },
  {
    id: "remove-bg",
    href: "/remove-bg",
    title: "Background Remover",
    titleKm: "លុបផ្ទៃក្រោយ",
    blurb: "កាត់ subject ចេញពី BG ភ្លាមៗក្នុង browser",
    status: "live",
    accent: "#5ec4b0",
  },
  {
    id: "collage",
    href: "/collage",
    title: "Photo Collage Maker",
    titleKm: "បង្កើត Collage",
    blurb: "រៀបរូបច្រើនជា layout ស្អាត មួយចុច export",
    status: "live",
    accent: "#f0a0c0",
  },
  {
    id: "generate",
    href: "/generate",
    title: "AI Image Generator",
    titleKm: "បង្កើតរូប AI",
    blurb: "Prompt → រូបថ្មី (ភ្ជាប់ HF model ក្រោយ)",
    status: "beta",
    accent: "#8eb5ff",
  },
  {
    id: "video",
    href: "/video",
    title: "AI Video Generator",
    titleKm: "បង្កើតវីដេអូ AI",
    blurb: "រូប/prompt → clip ខ្លី (pipeline អនាគត)",
    status: "soon",
    accent: "#c4a0ff",
  },
  {
    id: "face-swap",
    href: "/face-swap",
    title: "AI Face Swap",
    titleKm: "ប្តូរមុខ AI",
    blurb: "ដាក់មុខលើរូបគោល — smart face align",
    status: "beta",
    accent: "#ff9b7a",
  },
];
