export type StudioToolId =
  | "media"
  | "audio"
  | "text"
  | "captions"
  | "effects"
  | "transitions"
  | "dubbing";

export interface StudioToolDef {
  id: StudioToolId;
  label: string;
  shortLabel: string;
  description: string;
  implemented: boolean;
}

export const STUDIO_TOOLS: StudioToolDef[] = [
  {
    id: "media",
    label: "Media",
    shortLabel: "Media",
    description: "Import and browse video and image assets",
    implemented: true,
  },
  {
    id: "audio",
    label: "Audio",
    shortLabel: "Audio",
    description: "Import and browse audio assets",
    implemented: true,
  },
  {
    id: "text",
    label: "Text",
    shortLabel: "Text",
    description: "Add timeline text clips",
    implemented: true,
  },
  {
    id: "captions",
    label: "Captions",
    shortLabel: "Caps",
    description: "Generate and edit subtitles",
    implemented: true,
  },
  {
    id: "effects",
    label: "Effects",
    shortLabel: "FX",
    description: "Visual effects library",
    implemented: false,
  },
  {
    id: "transitions",
    label: "Transitions",
    shortLabel: "Trans",
    description: "Clip transitions",
    implemented: false,
  },
  {
    id: "dubbing",
    label: "Dubbing",
    shortLabel: "Dub",
    description: "AI dubbing and voice mix",
    implemented: true,
  },
];
