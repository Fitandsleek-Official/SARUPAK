import { Module } from "@nestjs/common";
import {
  DiarizationService,
  ManualDiarizationProvider,
  MockDiarizationProvider,
  UnavailableDiarizationProvider,
} from "./diarization.service";

@Module({
  providers: [
    MockDiarizationProvider,
    ManualDiarizationProvider,
    UnavailableDiarizationProvider,
    DiarizationService,
  ],
  exports: [DiarizationService],
})
export class DiarizationModule {}
