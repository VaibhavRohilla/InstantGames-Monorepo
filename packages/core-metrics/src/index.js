"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsModule = exports.NoopMetricsService = exports.PrometheusMetricsService = exports.METRICS = void 0;
const common_1 = require("@nestjs/common");
const prom_client_1 = require("prom-client");
exports.METRICS = Symbol("METRICS");
class PrometheusMetricsService {
    counters = new Map();
    histograms = new Map();
    constructor() {
        prom_client_1.register.setDefaultLabels({ service: "instant-games" });
    }
    increment(name, labels = {}) {
        const counter = this.getOrCreateCounter(name, Object.keys(labels));
        counter.inc(labels, 1);
    }
    observe(name, value, labels = {}) {
        const histogram = this.getOrCreateHistogram(name, Object.keys(labels));
        histogram.observe(labels, value);
    }
    getOrCreateCounter(name, labelNames) {
        if (!this.counters.has(name)) {
            this.counters.set(name, new prom_client_1.Counter({
                name,
                help: `${name}_counter`,
                labelNames,
            }));
        }
        return this.counters.get(name);
    }
    getOrCreateHistogram(name, labelNames) {
        if (!this.histograms.has(name)) {
            this.histograms.set(name, new prom_client_1.Histogram({
                name,
                help: `${name}_histogram`,
                labelNames,
                buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
            }));
        }
        return this.histograms.get(name);
    }
}
exports.PrometheusMetricsService = PrometheusMetricsService;
class NoopMetricsService {
    increment() { }
    observe() { }
}
exports.NoopMetricsService = NoopMetricsService;
let MetricsModule = class MetricsModule {
};
exports.MetricsModule = MetricsModule;
exports.MetricsModule = MetricsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.METRICS,
                useFactory: () => {
                    if (process.env.METRICS_DISABLED === "true") {
                        return new NoopMetricsService();
                    }
                    return new PrometheusMetricsService();
                },
            },
        ],
        exports: [exports.METRICS],
    })
], MetricsModule);
