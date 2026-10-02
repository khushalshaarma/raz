import { randomUUID } from "crypto";

export function generateRequestId(): string {
  return randomUUID();
}

export function extractRequestId(headers: Headers): string {
  return (headers.get("x-request-id") as string) || generateRequestId();
}

export function propagationHeaders(requestId: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) headers[`x-${key}`] = value;
    }
  }
  return headers;
}
