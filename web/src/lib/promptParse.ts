import { EditParams } from "./types";

export interface PromptIntent {
  lookId: string | null;
  modifiers: Partial<EditParams>;
  notes: string[];
  raw: string;
}

const LOOK_ALIASES: Array<{ id: string; keys: string[] }> = [
  {
    id: "portrait_pro",
    keys: ["portrait pro", "pro portrait", "រូបមនុស្ស", "subject", "person"],
  },
  {
    id: "garden_bloom",
    keys: ["garden", "flower", "bloom", "ផ្កា", "សួន", "bougainvillea"],
  },
  {
    id: "golden_portrait",
    keys: ["golden portrait", "golden hour", "មាស", "ល្ងាច", "sunset portrait"],
  },
  {
    id: "editorial_glow",
    keys: ["glow", "editorial", "halo", "rim", "attitude", "ភ្លឺ"],
  },
  {
    id: "natural",
    keys: ["natural", "ធម្មជាតិ", "ស្អាត", "clean", "balanced"],
  },
  {
    id: "vivid",
    keys: ["vivid", "colorful", "ច្បាស់", "រស់រវើក", "saturated", "pop"],
  },
  {
    id: "cinematic",
    keys: ["cinematic", "cinema", "film look", "ភាពយន្ត", "movie", "teal"],
  },
  {
    id: "soft_portrait",
    keys: ["soft", "skin", "សាច់", "មុខ", "beauty", "សុភាព"],
  },
  {
    id: "moody",
    keys: ["moody", "dark", "dramatic", "ងងឹត", "អារម្មណ៍", "drama"],
  },
  {
    id: "bright_air",
    keys: ["airy", "bright", "high key", "ភ្លឺស្រាល", "ស្រាល", "lifestyle"],
  },
];

/**
 * Parse free-text prompt (Khmer + English) into look + slider modifiers.
 */
export function parsePrompt(prompt: string): PromptIntent {
  const raw = prompt.trim();
  const text = raw.toLowerCase();
  const notes: string[] = [];
  const modifiers: Partial<EditParams> = {};

  if (!raw) {
    return { lookId: null, modifiers: {}, notes: [], raw };
  }

  let lookId: string | null = null;
  for (const alias of LOOK_ALIASES) {
    if (alias.keys.some((k) => text.includes(k.toLowerCase()))) {
      lookId = alias.id;
      notes.push(`រចនាប័ទ្ធ: ${alias.id}`);
      break;
    }
  }

  const bump = (
    key: keyof EditParams,
    amount: number,
    note: string,
  ) => {
    modifiers[key] = (modifiers[key] ?? 0) + amount;
    notes.push(note);
  };

  if (
    /bright|brighter|ភ្លឺ|លើកពន្លឺ|expose|light up|ច្បាស់ជាង/.test(text)
  ) {
    bump("exposure", 0.35, "លើក exposure");
    bump("shadows", 18, "លើក shadows");
  }
  if (/dark|darker|ងងឹត|បន្ថយពន្លឺ|moody dim/.test(text)) {
    bump("exposure", -0.3, "បន្ថយ exposure");
    bump("blacks", -10, "crush blacks");
  }
  if (/warm|កក់|លឿង|orange|sunset/.test(text)) {
    bump("temperature", 22, "កក់ temperature");
  }
  if (/cool|cold|ត្រជាក់|ខៀវ|blue tone/.test(text)) {
    bump("temperature", -20, "ត្រជាក់ temperature");
  }
  if (/vivid|color|ពណ៌|saturat|រស់/.test(text)) {
    bump("vibrance", 20, "លើក vibrance");
    bump("saturation", 6, "លើក saturation");
  }
  if (/soft|ស្រអាប់|gentle|dreamy/.test(text)) {
    bump("clarity", -12, "បន្ថយ clarity");
    bump("contrast", -6, "បន្ថយ contrast");
  }
  if (/sharp|ច្បាស់|crisp|detail|clarity/.test(text)) {
    bump("clarity", 16, "លើក clarity");
    bump("contrast", 8, "លើក contrast");
  }
  if (/fade|film fade|vintage|ហ្វីល/.test(text)) {
    bump("blacks", 12, "fade blacks");
    bump("contrast", -4, "soft contrast");
    bump("saturation", -6, "mute saturation");
  }
  if (/contrast|contrasty|ខ្លាំង/.test(text)) {
    bump("contrast", 16, "លើក contrast");
  }
  if (/sky|មេឃ/.test(text)) {
    bump("highlights", -22, "ការពារ sky highlights");
    bump("vibrance", 8, "លើកពណ៌មេឃ");
  }
  if (/green|nature|ធម្មជាតិ|ស្លឹក|ដើមឈើ/.test(text)) {
    bump("vibrance", 14, "លើក nature greens");
    bump("clarity", 8, "ច្បាស់ស្លឹក");
  }
  if (/skin|portrait|មុខ|សាច់/.test(text)) {
    bump("saturation", -8, "ការពារ skin sat");
    bump("clarity", -6, "soft skin");
    bump("temperature", 6, "skin warmth");
  }

  return { lookId, modifiers, notes, raw };
}
