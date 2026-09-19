import { ConfigService } from "@nestjs/config";
import { OpenAiTranslateProvider } from "./openai-translate.provider";

describe("OpenAiTranslateProvider", () => {
  function makeProvider(fetchImpl: typeof fetch) {
    const config = {
      get: (key: string) => {
        if (key === "OPENAI_API_KEY") return "sk-test";
        if (key === "OPENAI_BASE_URL") return "https://api.openai.com/v1";
        if (key === "OPENAI_TRANSLATE_MODEL") return "gpt-4o-mini";
        return undefined;
      },
    } as unknown as ConfigService;
    return new OpenAiTranslateProvider(config, fetchImpl);
  }

  it("rejects when API key missing", async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const provider = new OpenAiTranslateProvider(config, fetch);
    await expect(
      provider.translateToKhmer([{ id: "1", text: "Hello" }], "en"),
    ).rejects.toThrow(/translate_not_configured/i);
  });

  it("maps translated cues by id", async () => {
    const provider = makeProvider(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cues: [
                    { id: "a", text: "សួស្តី" },
                    { id: "b", text: "ពិភពលោក" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await provider.translateToKhmer(
      [
        { id: "a", text: "Hello" },
        { id: "b", text: "World" },
      ],
      "en",
    );
    expect(result.targetLanguage).toBe("km");
    expect(result.cues[0]?.text).toBe("សួស្តី");
    expect(result.cues[1]?.text).toBe("ពិភពលោក");
    expect(result.warnings).toEqual([]);
  });

  it("surfaces HTTP errors without falling back to source copy", async () => {
    const provider = makeProvider(
      async () => new Response("fail", { status: 503 }),
    );
    await expect(
      provider.translateToKhmer([{ id: "a", text: "Hello" }], "en"),
    ).rejects.toThrow(/translate_provider_error|503/);
  });
});
