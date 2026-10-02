type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  merchantId?: string;
  agentRunId?: string;
  executionId?: string;
  paymentId?: string;
  durationMs?: number;
  event?: string;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): number {
  const level = (process.env.LOG_LEVEL || "info") as LogLevel;
  return LOG_LEVELS[level] ?? 1;
}

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const REDACTED_KEYS = [
    "password", "token", "secret", "apikey", "authorization",
    "jwt_secret", "razorpay_key_secret", "razorpay_webhook_secret",
  ];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACTED_KEYS.some((rk) => key.toLowerCase().includes(rk))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(redact(entry as Record<string, unknown>));
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (getMinLevel() > 0) return;
    console.debug(formatEntry({ timestamp: new Date().toISOString(), level: "debug", message, ...meta }));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (getMinLevel() > 1) return;
    console.info(formatEntry({ timestamp: new Date().toISOString(), level: "info", message, ...meta }));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (getMinLevel() > 2) return;
    console.warn(formatEntry({ timestamp: new Date().toISOString(), level: "warn", message, ...meta }));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatEntry({ timestamp: new Date().toISOString(), level: "error", message, ...meta }));
  },
};

export function createRequestLogger(requestId: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(message, { requestId, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { requestId, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(message, { requestId, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, { requestId, ...meta }),
  };
}
