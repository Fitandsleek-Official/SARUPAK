import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

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
}
