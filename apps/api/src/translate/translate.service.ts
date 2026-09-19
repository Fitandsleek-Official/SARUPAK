import { Injectable } from "@nestjs/common";
import { OpenAiTranslateProvider } from "./openai-translate.provider";

@Injectable()
export class TranslateService {
  constructor(private readonly openai: OpenAiTranslateProvider) {}

  async status() {
    const configured = await this.openai.isConfigured();
    return {
      active: configured ? this.openai.name : "not_configured",
      openaiConfigured: configured,
      targetLanguages: ["km"],
      sourceLanguagesHint: ["en", "zh", "ja", "km", "auto"],
      notes: configured
        ? [
            "OpenAI translate is configured (API key present; never exposed to clients).",
            "Target for Studio Phase 7: Khmer (km) subtitle sets.",
          ]
        : [
            "OPENAI_API_KEY not set — translate-to-Khmer is unavailable.",
          ],
    };
  }

  translateToKhmer(
    cues: Array<{ id: string; text: string }>,
    sourceLanguage?: string,
  ) {
    return this.openai.translateToKhmer(cues, sourceLanguage);
  }
}
