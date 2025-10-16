import { Logger } from '@nestjs/common';
export type CBState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

// sliding window circuit breaker
export class circuitBreaker {
  private readonly logger = new Logger(circuitBreaker.name);

  private outcomes: number[] = [];
  public state: CBState = 'CLOSED';
  private lastOpenedAt = 0;
  private halfOpenProbes = 0;
  private successProbes = 0;

  constructor(
    private windowSize = 20,
    private failureThreshold = 0.5,
    private cooldownMs = 30000,
    private halfOpenMaxProbes = 5,
    private halfOpenSuccessThreshold = 5,
  ) {}

  public pushOutcome(v: 0 | 1) {
    this.outcomes.push(v);
    if (this.outcomes.length > this.windowSize) {
      this.outcomes.shift(); // always keep the last windowSize outcomes
    }
    this.evaluateState();
  }

  private failureRate() {
    const sum = this.outcomes.reduce((a, b) => a + b, 0);
    return sum / this.outcomes.length;
  }

  private evaluateState() {
    const now = Date.now();

    if (this.state === 'OPEN') {
      if (now - this.lastOpenedAt > this.cooldownMs) {
        this.state = 'HALF-OPEN';
        this.halfOpenProbes = 0;
        this.logger.log('[CB] OPEN -> HALF-OPEN');
      }
      return;
    }

    if (this.state === 'HALF-OPEN') {
      return;
    }

    if (this.outcomes.length >= this.windowSize) {
      const fRate = this.failureRate();
      if (fRate >= this.failureThreshold) {
        this.state = 'OPEN';
        this.lastOpenedAt = now;
        this.logger.log('[CB] CLOSED -> OPEN');
      }
    }
  }

  allowRequest(): boolean {
    return this.state != 'OPEN';
  }

  // Handline HALF-OPEN state, probe results
  onProbeResult(success: boolean) {
    if (this.state != 'HALF-OPEN') return;

    this.halfOpenProbes++;

    if (success) {
      this.successProbes++;

      if (this.successProbes > this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.outcomes = [];
        this.logger.log('[CB] HALF-OPEN -> CLOSED (probe succeeded)');
        return;
      }
    } else {
      if (this.halfOpenProbes >= this.halfOpenMaxProbes) {
        this.state = 'OPEN';
        this.lastOpenedAt = Date.now();
        this.logger.log('[CB] HALF-OPEN -> OPEN (probe failed)');
      }
    }
  }

  status() {
    return {
      state: this.state,
      windowSize: this.windowSize,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
      halfOpenProbes: this.halfOpenProbes,
      outcomeCount: this.outcomes,
      failureRate: this.failureRate(),
    };
  }
}
