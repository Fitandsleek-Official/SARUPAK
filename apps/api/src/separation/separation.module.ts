import { Module } from "@nestjs/common";
import {
  DemucsSeparationProvider,
  PassthroughSeparationProvider,
  SeparationService,
  UnavailableSeparationProvider,
} from "./separation.service";
import { SotakaSeparationProvider } from "./sotaka.separation-provider";

@Module({
  providers: [
    PassthroughSeparationProvider,
    UnavailableSeparationProvider,
    DemucsSeparationProvider,
    SotakaSeparationProvider,
    SeparationService,
  ],
  exports: [SeparationService],
})
export class SeparationModule {}
