import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { circuitBreaker } from '../circuit-breaker.js';

@Injectable()
export class AggregatorService {
  private readonly logger = new Logger(AggregatorService.name);

  public weatherBreaker = new circuitBreaker(10, 0.4, 20000, 5, 3);

  constructor(private readonly http: HttpService) {}

  public v1Hits = 0;
  public v2Hits = 0;

  // ---------- SCATTER–GATHER ----------
  async searchTrips(from: string, to: string, date: string) {
    this.v1Hits++;
    this.logger.log(`searchTrips v1 hits: ${this.v1Hits}`);

    const timeoutBudget = 1000;

    const flightURL = `http://localhost:3001/flights/search?from=${from}&to=${to}&date=${date}`;
    const hotelURL = `http://localhost:3002/hotel/search?to=${to}`;

    async function withTimeout(promise, name) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error(`${name} timeout`));
          }, timeoutBudget),
        ),
      ]);
    }

    const flightPromise = withTimeout(
      lastValueFrom(this.http.get(flightURL)).then((res) => res.data),
      'flight-service',
    );

    const hotelPromise = withTimeout(
      lastValueFrom(this.http.get(hotelURL)).then((res) => res.data),
      'hotel-service',
    );

    let flights: any = null;
    let hotels: any = null;
    let degraded = false;

    try {
      const results = await Promise.allSettled([flightPromise, hotelPromise]);

      const [flightsResult, hotelsResult] = results;

      if (flightsResult.status === 'fulfilled') {
        const flightData = flightsResult.value;

        if (flightData.flights.length === 0) {
          flights = { message: 'No flights available for this route' };
        } else {
          flights = flightData;
        }
      } else {
        degraded = true;
        flights = { message: 'Flight service unavailable' };
      }

      if (hotelsResult.status === 'fulfilled') {
        const hotelData = hotelsResult.value;
        if (hotelData.hotels.length === 0) {
          hotels = { message: 'No hotels available for this destination' };
        } else {
          hotels = hotelData;
        }
      } else {
        degraded = true;
        hotels = { message: 'Hotel service unavailable' };
      }
    } catch (error) {
      this.logger.warn(`Timeout or failure: ${error.message}`);
    }

    return { flights, hotels, degraded };
  }

  // ---------- CHAINING ----------
  async cheapestRoute(from: string, to: string, date: string) {
    const timeoutBudget = 1000;
    const cheapestFlightURL = `http://localhost:3001/flights/cheapest?from=${from}&to=${to}&date=${date}`;
    const hotelSearchURL = `http://localhost:3002/hotel/search`;

    async function withTimeout(promise, name) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error(`${name} timeout`));
          }, timeoutBudget),
        ),
      ]);
    }

    try {
      const flightResponse = await withTimeout(
        lastValueFrom(this.http.get(cheapestFlightURL)).then((res) => res.data),
        'flight-service',
      );

      const flight = flightResponse.flight;
      this.logger.log(`Cheapest flight found: ${flight.id}`);

      const arrival = new Date(flight.arriveTime);
      const arrivalHour = arrival.getHours();
      const lateCheckIn = arrivalHour >= 20 || arrivalHour <= 6;

      const hotelResponse = await withTimeout(
        lastValueFrom(
          this.http.get(hotelSearchURL, {
            params: { to, late: lateCheckIn },
          }),
        ).then((res) => res.data),
        'hotel-service',
      );

      return {
        flight,
        hotels: hotelResponse.hotels,
        lateCheckIn,
        degraded: false,
      };
    } catch (error) {
      this.logger.warn(`Chaining failed: ${error.message}`);
      return { message: 'Partial or failed aggregation', degraded: true };
    }
  }

  // ----------- BRANCHING ----------
  async contextualTrip(from: string, to: string, date: string) {
    const timeoutBudget = 1000;
    const coastalDestinations = ['CMB', 'BKK', 'MLE'];
    const isCoastal = coastalDestinations.includes(to);

    const flightURL = `http://localhost:3001/flights/search?from=${from}&to=${to}&date=${date}`;
    const hotelURL = `http://localhost:3002/hotel/search?to=${to}`;
    const eventsURL = `http://localhost:3003/events/search?to=${to}&date=${date}`;

    async function withTimeout(promise, name) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error(`${name} timeout`));
          }, timeoutBudget),
        ),
      ]);
    }

    let flights: any = null;
    let hotels: any = null;
    let events: any = null;
    let degraded = false;

    try {
      // base calls are aways called
      const baseCalls = [
        withTimeout(
          lastValueFrom(this.http.get(flightURL)).then((res) => res.data),
          'flight-service',
        ),
        withTimeout(
          lastValueFrom(this.http.get(hotelURL)).then((res) => res.data),
          'hotel-service',
        ),
      ];

      const results = await Promise.allSettled(baseCalls);

      const [flightsResult, hotelsResult] = results;

      if (flightsResult.status === 'fulfilled') {
        const flightData = flightsResult.value;

        if (flightData.flights.length === 0) {
          flights = { message: 'No flights available for this route' };
        } else {
          flights = flightData;
        }
      } else {
        degraded = true;
        flights = { message: 'Flight service unavailable' };
      }

      if (hotelsResult.status === 'fulfilled') {
        const hotelData = hotelsResult.value;
        if (hotelData.hotels.length === 0) {
          hotels = { message: 'No hotels available for this destination' };
        } else {
          hotels = hotelData;
        }
      } else {
        degraded = true;
        hotels = { message: 'Hotel service unavailable' };
      }

      // call conditionally
      if (isCoastal) {
        events = await withTimeout(
          lastValueFrom(this.http.get(eventsURL)).then((res) => res.data),
          'events-service',
        );
      } else {
        this.logger.log(
          `Destination ${to} is inland → skipping events-service`,
        );
        events = { message: 'No events for inland destinations' };
      }
    } catch (error) {
      this.logger.warn(`Timeout or failure: ${error.message}`);
      degraded = true;
      events = { message: 'Events service unavailable' };
    }

    return { flights, hotels, events, degraded };
  }

  // ---------- VERSIONING ----------
  async searchTripsV2(from: string, to: string, date: string) {
    this.v2Hits++;
    this.logger.log(`searchTrips v2 hits: ${this.v2Hits}`);

    const timeoutBudget = 1000;
    const flightURL = `http://localhost:3001/flights/search?from=${from}&to=${to}&date=${date}`;
    const hotelURL = `http://localhost:3002/hotel/search?to=${to}`;
    const weatherURL = `http://localhost:3004/weather/forecast?city=${to}&date=${date}`;

    async function withTimeout(promise, name) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error(`${name} timeout`));
          }, timeoutBudget),
        ),
      ]);
    }

    let flights: any = null;
    let hotels: any = null;
    let weather: any = null;
    let degraded = false;

    try {
      const [flightResponse, hotelResponse, weatherResponse] =
        await Promise.allSettled([
          withTimeout(
            lastValueFrom(this.http.get(flightURL)).then((res) => res.data),
            'flight-service',
          ),
          withTimeout(
            lastValueFrom(this.http.get(hotelURL)).then((res) => res.data),
            'hotel-service',
          ),
          withTimeout(
            lastValueFrom(this.http.get(weatherURL)).then((res) => res.data),
            'weather-service',
          ),
        ]);

      if (flightResponse.status === 'fulfilled') {
        flights = flightResponse.value;
        if (flights.flights.length === 0) {
          flights = { message: 'No flights available for this route' };
        }
      } else {
        degraded = true;
        flights = { message: 'Flight service unavailable' };
      }

      if (hotelResponse.status === 'fulfilled') {
        hotels = hotelResponse.value;
        if (hotels.hotels.length === 0) {
          hotels = { message: 'No hotels available for this destination' };
        }
      } else {
        degraded = true;
        hotels = { message: 'Hotel service unavailable' };
      }

      if (weatherResponse.status === 'fulfilled') {
        weather = weatherResponse.value;
      } else {
        degraded = true;
        weather = {
          weather: [],
          degraded: true,
          summary: 'Weather data unavailable',
        };
      }
    } catch (error) {
      this.logger.warn(`v2 aggregation failed: ${error.message}`);
      degraded = true;
    }

    return { flights, hotels, weather, degraded };
  }

  // --------- CIRCUIT BREAKER -----------

  async searchTripsCB(from: string, to: string, date: string) {
    this.logger.log(`[v2-cb] searchTrips started`);

    const timeoutBudget = 3000;
    const flightURL = `http://localhost:3001/flights/search?from=${from}&to=${to}&date=${date}`;
    const hotelURL = `http://localhost:3002/hotel/search?to=${to}&date=${date}`;
    const weatherURL = `http://localhost:3004/weather/forecast?city=${to}&date=${date}`;

    async function withTimeout(promise, name) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${name} timeout`)), timeoutBudget),
        ),
      ]);
    }

    let flights: any = null;
    let hotels: any = null;
    let weather: any = null;
    let degraded = false;

    try {
      // Base requests no breaker
      this.logger.log(
        `[v2-cb] base requests starting flight and hotel fetch...`,
      );
      const [flightResponse, hotelResponse] = await Promise.allSettled([
        withTimeout(
          lastValueFrom(this.http.get(flightURL)).then((res) => res.data),
          'flight-service',
        ),
        withTimeout(
          lastValueFrom(this.http.get(hotelURL)).then((res) => res.data),
          'hotel-service',
        ),
      ]);

      this.logger.log(`Aggregator base requests completed`);

      if (flightResponse.status === 'fulfilled') {
        flights = flightResponse.value;
        this.logger.log(`Flight service success`);
      } else {
        this.logger.warn(`Flight service failed :${flightResponse.reason}`);
        degraded = true;
      }

      if (hotelResponse.status === 'fulfilled') {
        hotels = hotelResponse.value;
        this.logger.log(`Hotel service success`);
      } else {
        this.logger.warn(`Hotel service failed :${hotelResponse.reason}`);
      }
    } catch (e) {
      degraded = true;
      this.logger.warn(`[v2-cb] base requests failed: ${e.message}`);
    }

    this.logger.log(`Weather request wrapped by CB started`);
    this.logger.log(`[CB] current state : ${this.weatherBreaker.state}`);

    if (!this.weatherBreaker.allowRequest()) {
      // breaker is OPEN
      this.logger.warn('[CB] is OPEN - skipping weather call');
      this.logger.log(
        `[CB] Status: ${JSON.stringify(this.weatherBreaker.status())}`,
      );

      weather = {
        degraded: true,
        summary: 'Weather data unavailable (CB open)',
      };
      degraded = true;
      this.weatherBreaker.pushOutcome(0);
    } else {
      // breaker is either CLOSE / HALF-OPEN
      try {
        this.logger.log(`Calling weather service as CB is not OPEN`);
        const response = await withTimeout(
          lastValueFrom(this.http.get(weatherURL)).then((res) => res.data),
          'weather-service',
        );

        // record success
        this.logger.log(`weather service call succeeded`);
        this.weatherBreaker.pushOutcome(0);
        this.weatherBreaker.onProbeResult(true);

        weather = response;
      } catch (e) {
        // record failure
        this.logger.log(`weather service call failed: ${e.message}`);
        this.weatherBreaker.pushOutcome(1);
        this.weatherBreaker.onProbeResult(false);

        degraded = true;
        weather = {
          summary: 'unavailable',
          degraded: true,
        };
      }
    }

    const breakerStatus = this.weatherBreaker.status();
    this.logger.log(`[CB] Status: ${JSON.stringify(breakerStatus)}`);

    this.logger.log[`v2-cb trip search completed`];
    return { flights, hotels, weather, degraded };
  }
}
