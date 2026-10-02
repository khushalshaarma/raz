import type { MemoryType } from "../types";
import { storeMemory, retrieveMemory, listMemory, createMemoryKey } from "./memory";
import type { MemoryCategory } from "../types";

const SHORT_TERM_MEMORY: MemoryType = "SHORT_TERM";

export async function storeShortTermMemory(
  merchantId: string,
  category: MemoryCategory,
  key: string,
  value: Record<string, unknown>,
  confidence?: number
): Promise<string> {
  return storeMemory({
    merchantId,
    memoryType: SHORT_TERM_MEMORY,
    category,
    key,
    value,
    confidence,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });
}

export async function getShortTermMemory(
  merchantId: string,
  category: MemoryCategory,
  key: string
) {
  return retrieveMemory(merchantId, SHORT_TERM_MEMORY, category, key);
}

export async function listShortTermMemory(
  merchantId: string,
  category?: MemoryCategory
) {
  return listMemory(merchantId, SHORT_TERM_MEMORY, category);
}

export function buildCycleContextKey(cycleId: string, step: string): string {
  return createMemoryKey("cycle", cycleId, step);
}

export function buildAgentOutputKey(agentType: string, cycleId: string): string {
  return createMemoryKey("agent", agentType, "output", cycleId);
}
