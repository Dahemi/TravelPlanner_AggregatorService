import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AggregatorModule } from './aggregator/aggregator.module.js';

@Module({
  imports: [AggregatorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
