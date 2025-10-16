import { Module } from '@nestjs/common';
import { AggregatorController } from './aggregator.controller.js'
import { AggregatorService } from './aggregator.service.js';
import { HttpModule } from '@nestjs/axios';


@Module({
  imports: [HttpModule],
  controllers: [AggregatorController],
  providers: [AggregatorService]
})
export class AggregatorModule {}
