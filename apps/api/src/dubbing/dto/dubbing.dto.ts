import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateDubbingSessionDto {
  @IsString()
  mediaAssetId!: string;

  @IsOptional()
  @IsString()
  subtitleSetId?: string;

  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @IsOptional()
  @IsString()
  targetLanguage?: string;

  @IsOptional()
  @IsIn(["openai-tts", "mock"])
  ttsProvider?: "openai-tts" | "mock";
}

export class AssignVoiceDto {
  @IsString()
  speakerId!: string;

  @IsString()
  voiceCharacterId!: string;
}

class SegmentPatchDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  translatedText?: string;

  @IsOptional()
  @IsString()
  speakerId?: string;

  @IsOptional()
  @IsString()
  voiceCharacterId?: string;

  @IsOptional()
  @IsNumber()
  startMs?: number;

  @IsOptional()
  @IsNumber()
  endMs?: number;
}

class VoiceAssignmentDto {
  @IsString()
  speakerId!: string;

  @IsString()
  voiceCharacterId!: string;
}

export class UpdateDubbingSessionDto {
  @IsOptional()
  @IsIn(["replace_dialogue", "mix", "dialogue_only", "original_only"])
  mixMode?: "replace_dialogue" | "mix" | "dialogue_only" | "original_only";

  @IsOptional()
  @IsIn(["openai-tts", "mock"])
  ttsProvider?: "openai-tts" | "mock";

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  dialogueVolume?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  backgroundVolume?: number;

  @IsOptional()
  @IsString()
  targetLanguage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentPatchDto)
  segments?: SegmentPatchDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoiceAssignmentDto)
  voiceAssignments?: VoiceAssignmentDto[];
}

export class GenerateTtsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segmentIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0.75)
  @Max(1.35)
  speakingRate?: number;

  /** Explicit provider for this run; overrides session if set. Never silent mock. */
  @IsOptional()
  @IsIn(["openai-tts", "mock"])
  ttsProvider?: "openai-tts" | "mock";
}
