import { createHash } from "crypto";

interface ReplayWindow {
  eventIds: Set<string>;
  timestamps: Map<string, number>;
}

const replayWindows = new Map<string, ReplayWindow>();
const CLEANUP_INTERVAL = 60_000;

const DEFAULT_WINDOW_MS = 300_000;

let lastCleanup = Date.now();

function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const entries = Array.from(replayWindows.entries());
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    const window = entries[i][1];
    const expired: string[] = [];
    const tsEntries = Array.from(window.timestamps.entries());
    for (let j = 0; j < tsEntries.length; j++) {
      const id = tsEntries[j][0];
      const timestamp = tsEntries[j][1];
      if (now - timestamp > DEFAULT_WINDOW_MS) {
        expired.push(id);
      }
    }
    for (let k = 0; k < expired.length; k++) {
      window.eventIds.delete(expired[k]);
      window.timestamps.delete(expired[k]);
    }
    if (window.eventIds.size === 0) {
      replayWindows.delete(key);
    }
  }
}

export function isReplayEvent(
  merchantId: string,
  eventId: string,
  windowMs: number = DEFAULT_WINDOW_MS
): { isReplay: boolean; reason?: string } {
  cleanupIfNeeded();

  if (!merchantId || !eventId) {
    return { isReplay: false };
  }

  const key = merchantId;
  let window = replayWindows.get(key);

  if (!window) {
    window = { eventIds: new Set(), timestamps: new Map() };
    replayWindows.set(key, window);
  }

  const now = Date.now();

  const existingTimestamp = window.timestamps.get(eventId);
  if (existingTimestamp && now - existingTimestamp < windowMs) {
    return {
      isReplay: true,
      reason: `Event ${eventId} already received within ${windowMs}ms window`,
    };
  }

  window.eventIds.add(eventId);
  window.timestamps.set(eventId, now);

  return { isReplay: false };
}

export function generateEventId(
  merchantId: string,
  eventType: string,
  payload: string
): string {
  return createHash("sha256")
    .update(`${merchantId}:${eventType}:${payload}`)
    .digest("hex")
    .slice(0, 32);
}

export function getReplayStats(merchantId: string): {
  eventCount: number;
  oldestEventAge: number | null;
} {
  const window = replayWindows.get(merchantId);
  if (!window) {
    return { eventCount: 0, oldestEventAge: null };
  }

  const now = Date.now();
  let oldestTimestamp = Infinity;
  const tsValues = Array.from(window.timestamps.values());
  for (let i = 0; i < tsValues.length; i++) {
    if (tsValues[i] < oldestTimestamp) {
      oldestTimestamp = tsValues[i];
    }
  }

  return {
    eventCount: window.eventIds.size,
    oldestEventAge: oldestTimestamp === Infinity ? null : now - oldestTimestamp,
  };
}

export function clearReplayWindow(merchantId: string): void {
  replayWindows.delete(merchantId);
}
