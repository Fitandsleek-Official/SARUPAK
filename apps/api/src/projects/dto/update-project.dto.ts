import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(7680)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(4320)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(240)
  frameRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsObject()
  timeline?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["DRAFT", "PROCESSING", "READY", "FAILED"])
  status?: "DRAFT" | "PROCESSING" | "READY" | "FAILED";

  @IsOptional()
  @IsBoolean()
  createSnapshot?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  snapshotLabel?: string;
}
