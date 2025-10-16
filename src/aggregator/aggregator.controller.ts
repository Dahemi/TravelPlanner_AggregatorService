import { Controller, Get, Query } from '@nestjs/common';
import { AggregatorService } from './aggregator.service.js';

@Controller()
export class AggregatorController {
  constructor(private readonly aggregatorService: AggregatorService) {}

  @Get('v1/trips/search')
  async search(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.aggregatorService.searchTrips(from, to, date);
  }

  @Get('v1/trips/cheapest-route')
  async cheapestRoute(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.aggregatorService.cheapestRoute(from, to, date);
  }

  @Get('v1/trips/contextual')
  async contextualTrip(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.aggregatorService.contextualTrip(from, to, date);
  }

  @Get('v2/trips/search')
  async searchV2(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.aggregatorService.searchTripsV2(from, to, date);
  }

  @Get('versioning/stats')
  stats() {
    return {
      v1Hits: this.aggregatorService.v1Hits,
      v2Hits: this.aggregatorService.v2Hits,
    };
  }

  @Get('v2-cb/trips/search')
  searchTripsV2Breaker(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.aggregatorService.searchTripsCB(from, to, date);
  }

  @Get('circuit-breaker/status')
  getBreakerStatus() {
    return this.aggregatorService.weatherBreaker.status();
  }
}
