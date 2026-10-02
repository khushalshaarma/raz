export type RetryClassification = "SAFE_TO_RETRY" | "NOT_SAFE_TO_RETRY" | "UNKNOWN";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const SAFE_CODES = [
  "TIMEOUT",
  "RATE_LIMIT",
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "429",
  "502",
  "503",
  "504",
];

const NOT_SAFE_CODES = [
  "VALIDATION_ERROR",
  "AUTH_ERROR",
  "PAYMENT_DECLINED",
  "INSUFFICIENT_FUNDS",
  "CARD_DECLINED",
  "INVALID_REQUEST",
  "400",
  "401",
  "403",
  "404",
  "422",
];

export function classifyRetry(failureCode: string | null): RetryClassification {
  if (!failureCode) return "UNKNOWN";
  if (SAFE_CODES.includes(failureCode)) return "SAFE_TO_RETRY";
  if (NOT_SAFE_CODES.includes(failureCode)) return "NOT_SAFE_TO_RETRY";
  return "UNKNOWN";
}

export function calculateRetryDelay(attempt: number, config?: Partial<RetryConfig>): number {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const delay = fullConfig.baseDelayMs * Math.pow(fullConfig.backoffMultiplier, attempt);
  return Math.min(delay, fullConfig.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    config?: Partial<RetryConfig>;
    onRetry?: (attempt: number, error: Error) => void;
    classify?: (error: Error) => RetryClassification;
  }
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options?.config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (options?.classify) {
        const classification = options.classify(lastError);
        if (classification === "NOT_SAFE_TO_RETRY") throw lastError;
      }

      if (attempt === config.maxAttempts - 1) throw lastError;

      const delay = calculateRetryDelay(attempt, config);
      options?.onRetry?.(attempt + 1, lastError);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Retry failed");
}
