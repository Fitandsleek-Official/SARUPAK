import { Module } from "@nestjs/common";
import {
  DemucsSeparationProvider,
  PassthroughSeparationProvider,
  SeparationService,
  UnavailableSeparationProvider,
} from "./separation.service";

@Module({
  providers: [
    PassthroughSeparationProvider,
    UnavailableSeparationProvider,
    DemucsSeparationProvider,
    SeparationService,
  ],
  exports: [SeparationService],
})
export class SeparationModule {}
