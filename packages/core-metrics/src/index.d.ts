export interface IMetrics {
    increment(name: string, labels?: Record<string, string>): void;
    observe(name: string, value: number, labels?: Record<string, string>): void;
}
export declare const METRICS: unique symbol;
export declare class PrometheusMetricsService implements IMetrics {
    private counters;
    private histograms;
    constructor();
    increment(name: string, labels?: Record<string, string>): void;
    observe(name: string, value: number, labels?: Record<string, string>): void;
    private getOrCreateCounter;
    private getOrCreateHistogram;
}
export declare class NoopMetricsService implements IMetrics {
    increment(): void;
    observe(): void;
}
export declare class MetricsModule {
}
