type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

interface CircuitBreakerEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  halfOpenAttempts: number;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxAttempts: 1,
};

const circuits = new Map<string, CircuitBreakerEntry>();

function getEntry(key: string): CircuitBreakerEntry {
  let entry = circuits.get(key);
  if (!entry) {
    entry = { state: "CLOSED", failureCount: 0, lastFailureAt: 0, halfOpenAttempts: 0 };
    circuits.set(key, entry);
  }
  return entry;
}

export interface CircuitBreakerResult {
  allowed: boolean;
  state: CircuitState;
  failureCount: number;
}

export function checkCircuitBreaker(
  key: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreakerResult {
  const fullConfig = { ...DEFAULT_CB_CONFIG, ...config };
  const entry = getEntry(key);

  if (entry.state === "OPEN") {
    const elapsed = Date.now() - entry.lastFailureAt;
    if (elapsed >= fullConfig.recoveryTimeoutMs) {
      entry.state = "HALF_OPEN";
      entry.halfOpenAttempts = 0;
    } else {
      return { allowed: false, state: "OPEN", failureCount: entry.failureCount };
    }
  }

  if (entry.state === "HALF_OPEN") {
    if (entry.halfOpenAttempts >= fullConfig.halfOpenMaxAttempts) {
      return { allowed: false, state: "HALF_OPEN", failureCount: entry.failureCount };
    }
    entry.halfOpenAttempts++;
  }

  return { allowed: true, state: entry.state, failureCount: entry.failureCount };
}

export function recordCircuitSuccess(key: string): void {
  const entry = getEntry(key);
  entry.failureCount = 0;
  entry.state = "CLOSED";
  entry.halfOpenAttempts = 0;
}

export function recordCircuitFailure(
  key: string,
  config?: Partial<CircuitBreakerConfig>
): void {
  const fullConfig = { ...DEFAULT_CB_CONFIG, ...config };
  const entry = getEntry(key);

  entry.failureCount++;
  entry.lastFailureAt = Date.now();

  if (entry.state === "HALF_OPEN") {
    entry.state = "OPEN";
    entry.halfOpenAttempts = 0;
    return;
  }

  if (entry.failureCount >= fullConfig.failureThreshold) {
    entry.state = "OPEN";
  }
}

export function getCircuitState(key: string): CircuitBreakerEntry {
  return { ...getEntry(key) };
}

export function resetCircuit(key: string): void {
  circuits.delete(key);
}

export function resetAllCircuits(): void {
  circuits.clear();
}
