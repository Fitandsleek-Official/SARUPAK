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
    description: "Import video and images",
    implemented: true,
  },
  {
    id: "audio",
    label: "Audio",
    shortLabel: "Audio",
    description: "Import audio files",
    implemented: true,
  },
  {
    id: "text",
    label: "Text",
    shortLabel: "Text",
    description: "Add text on the timeline",
    implemented: true,
  },
  {
    id: "captions",
    label: "Captions",
    shortLabel: "SRT",
    description: "Subtitles · translate to Khmer",
    implemented: true,
  },
  {
    id: "effects",
    label: "Effects",
    shortLabel: "FX",
    description: "Coming soon",
    implemented: false,
  },
  {
    id: "transitions",
    label: "Transitions",
    shortLabel: "Cut",
    description: "Coming soon",
    implemented: false,
  },
  {
    id: "dubbing",
    label: "Dubbing",
    shortLabel: "Dub",
    description: "Voices · male/female · mix",
    implemented: true,
  },
];
