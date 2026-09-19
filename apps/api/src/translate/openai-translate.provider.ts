import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface TranslateCueInput {
  id: string;
  text: string;
}

export interface TranslateCueResult {
  id: string;
  text: string;
}

export interface TranslateBatchResult {
  provider: string;
  targetLanguage: string;
  cues: TranslateCueResult[];
  warnings: string[];
}

/**
 * OpenAI Chat Completions adapter for subtitle translation.
 * Requires OPENAI_API_KEY. Never silently falls back to copy-source.
 */
@Injectable()
export class OpenAiTranslateProvider {
  readonly name = "openai-translate";
  private readonly logger = new Logger(OpenAiTranslateProvider.name);
  private fetchImpl: FetchLike;

  constructor(private readonly config: ConfigService) {
    this.fetchImpl = fetch;
  }

  setFetch(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  private apiKey(): string | undefined {
    const key = this.config.get<string>("OPENAI_API_KEY");
    return key?.trim() || undefined;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.apiKey());
  }

  async translateToKhmer(
    cues: TranslateCueInput[],
    sourceLanguage?: string,
  ): Promise<TranslateBatchResult> {
    const key = this.apiKey();
    if (!key) {
      throw new Error(
        "translate_not_configured: OPENAI_API_KEY is missing. Translation requires an OpenAI key.",
      );
    }
    if (cues.length === 0) {
      return {
        provider: this.name,
        targetLanguage: "km",
        cues: [],
        warnings: ["No cues to translate."],
      };
    }

    const base =
      this.config.get<string>("OPENAI_BASE_URL")?.replace(/\/$/, "") ||
      "https://api.openai.com/v1";
    const model =
      this.config.get<string>("OPENAI_TRANSLATE_MODEL")?.trim() ||
      "gpt-4o-mini";

    const payload = {
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You translate subtitle cues into Khmer (km). Return JSON only: " +
            '{"cues":[{"id":"...","text":"..."}]}. Preserve meaning, keep each id, ' +
            "do not merge or drop cues. Keep timing-agnostic plain text only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceLanguage: sourceLanguage || "auto",
            targetLanguage: "km",
            cues,
          }),
        },
      ],
    };

    const res = await this.fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.warn(`OpenAI translate HTTP ${res.status}`);
      throw new Error(
        `translate_provider_error: OpenAI HTTP ${res.status}${body ? ` — ${body.slice(0, 180)}` : ""}`,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("translate_provider_error: empty completion content");
    }

    let parsed: { cues?: Array<{ id?: string; text?: string }> };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      throw new Error("translate_provider_error: invalid JSON from model");
    }

    const byId = new Map<string, string>();
    for (const c of parsed.cues ?? []) {
      if (c.id && typeof c.text === "string") {
        byId.set(c.id, c.text);
      }
    }

    const warnings: string[] = [];
    const out: TranslateCueResult[] = cues.map((c) => {
      const text = byId.get(c.id);
      if (text == null || !text.trim()) {
        warnings.push(`Missing translation for cue ${c.id}; left empty.`);
        return { id: c.id, text: "" };
      }
      return { id: c.id, text: text.trim() };
    });

    return {
      provider: this.name,
      targetLanguage: "km",
      cues: out,
      warnings,
    };
  }
}
