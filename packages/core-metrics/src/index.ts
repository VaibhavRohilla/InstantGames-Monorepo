import { Global, Module } from "@nestjs/common";
import { Counter, Histogram, register } from "prom-client";

export interface IMetrics {
  increment(name: string, labels?: Record<string, string>): void;
  observe(name: string, value: number, labels?: Record<string, string>): void;
}

export const METRICS = Symbol("METRICS");

export class PrometheusMetricsService implements IMetrics {
  private counters = new Map<string, Counter<string>>();
  private histograms = new Map<string, Histogram<string>>();

  constructor() {
    register.setDefaultLabels({ service: "instant-games" });
  }

  increment(name: string, labels: Record<string, string> = {}): void {
    const counter = this.getOrCreateCounter(name, Object.keys(labels));
    counter.inc(labels, 1);
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const histogram = this.getOrCreateHistogram(name, Object.keys(labels));
    histogram.observe(labels, value);
  }

  private getOrCreateCounter(name: string, labelNames: string[]): Counter<string> {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        new Counter({
          name,
          help: `${name}_counter`,
          labelNames,
        })
      );
    }
    return this.counters.get(name)!;
  }

  private getOrCreateHistogram(name: string, labelNames: string[]): Histogram<string> {
    if (!this.histograms.has(name)) {
      this.histograms.set(
        name,
        new Histogram({
          name,
          help: `${name}_histogram`,
          labelNames,
          buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
        })
      );
    }
    return this.histograms.get(name)!;
  }
}

export class NoopMetricsService implements IMetrics {
  increment(): void {}
  observe(): void {}
}

@Global()
@Module({
  providers: [
    {
      provide: METRICS,
      useFactory: () => {
        if (process.env.METRICS_DISABLED === "true") {
          return new NoopMetricsService();
        }
        return new PrometheusMetricsService();
      },
    },
  ],
  exports: [METRICS],
})
export class MetricsModule {}
