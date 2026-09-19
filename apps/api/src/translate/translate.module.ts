import { Module } from "@nestjs/common";
import { OpenAiTranslateProvider } from "./openai-translate.provider";
import { TranslateService } from "./translate.service";

@Module({
  providers: [OpenAiTranslateProvider, TranslateService],
  exports: [TranslateService, OpenAiTranslateProvider],
})
export class TranslateModule {}
