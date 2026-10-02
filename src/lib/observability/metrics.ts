interface MetricEntry {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, tags?: Record<string, string>) {
    const key = this.key(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  gauge(name: string, value: number, tags?: Record<string, string>) {
    const key = this.key(name, tags);
    this.gauges.set(key, value);
  }

  histogram(name: string, value: number, tags?: Record<string, string>) {
    const key = this.key(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
  }

  snapshot(): MetricEntry[] {
    const entries: MetricEntry[] = [];
    const now = Date.now();
    this.counters.forEach((value: number, key: string) => {
      entries.push({ name: key, value, timestamp: now });
    });
    this.gauges.forEach((value: number, key: string) => {
      entries.push({ name: key, value, timestamp: now });
    });
    this.histograms.forEach((values: number[], key: string) => {
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      entries.push({ name: key, value: avg, timestamp: now });
    });
    return entries;
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private key(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagStr = Object.entries(tags)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${tagStr}}`;
  }
}

export const metrics = new MetricsCollector();

export function trackApiCall(endpoint: string, method: string, status: number, durationMs: number) {
  metrics.increment("api.request.count", { endpoint, method, status: String(status) });
  metrics.histogram("api.request.duration_ms", durationMs, { endpoint, method });
}

export function trackAgentRun(agentType: string, status: string, durationMs: number) {
  metrics.increment("agent.run.count", { agentType, status });
  metrics.histogram("agent.run.duration_ms", durationMs, { agentType });
}

export function trackGrowthCycle(status: string) {
  metrics.increment("growth_cycle.count", { status });
}

export function trackExecution(status: string) {
  metrics.increment("execution.count", { status });
}

export function trackPayment(status: string) {
  metrics.increment("payment.count", { status });
}

export function trackWebhook(status: string) {
  metrics.increment("webhook.count", { status });
}

export function trackGovernanceDecision(decision: string) {
  metrics.increment("governance.decision.count", { decision });
}

export function setHealthGauge(component: string, healthy: boolean) {
  metrics.gauge(`health.${component}`, healthy ? 1 : 0);
}
