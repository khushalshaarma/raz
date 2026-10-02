import { prisma } from "@/lib/prisma";
import type { MemoryType, MemoryCategory } from "../types";

export interface MemoryEntry {
  id: string;
  merchantId: string;
  memoryType: MemoryType;
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
}

export async function storeMemory(params: {
  merchantId: string;
  memoryType: MemoryType;
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  confidence?: number;
  expiresAt?: Date;
}): Promise<string> {
  const existing = await prisma.agentMemory.findUnique({
    where: {
      merchantId_memoryType_category_key: {
        merchantId: params.merchantId,
        memoryType: params.memoryType,
        category: params.category,
        key: params.key,
      },
    },
  });

  if (existing) {
    await prisma.agentMemory.update({
      where: { id: existing.id },
      data: {
        value: JSON.stringify(params.value),
        confidence: params.confidence ?? existing.confidence,
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }

  const record = await prisma.agentMemory.create({
    data: {
      merchantId: params.merchantId,
      memoryType: params.memoryType,
      category: params.category,
      key: params.key,
      value: JSON.stringify(params.value),
      confidence: params.confidence ?? 0.5,
      expiresAt: params.expiresAt,
    },
  });
  return record.id;
}

export async function retrieveMemory(
  merchantId: string,
  memoryType: MemoryType,
  category: MemoryCategory,
  key: string
): Promise<MemoryEntry | null> {
  const record = await prisma.agentMemory.findUnique({
    where: {
      merchantId_memoryType_category_key: {
        merchantId,
        memoryType,
        category,
        key,
      },
    },
  });

  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) {
    await prisma.agentMemory.delete({ where: { id: record.id } });
    return null;
  }

  await prisma.agentMemory.update({
    where: { id: record.id },
    data: { accessCount: record.accessCount + 1, lastAccessedAt: new Date() },
  });

  return {
    id: record.id,
    merchantId: record.merchantId,
    memoryType: record.memoryType as MemoryType,
    category: record.category as MemoryCategory,
    key: record.key,
    value: JSON.parse(record.value) as Record<string, unknown>,
    confidence: record.confidence,
    accessCount: record.accessCount + 1,
    lastAccessedAt: new Date(),
    createdAt: record.createdAt,
  };
}

export async function listMemory(
  merchantId: string,
  memoryType?: MemoryType,
  category?: MemoryCategory
): Promise<MemoryEntry[]> {
  const where: Record<string, unknown> = { merchantId };
  if (memoryType) where.memoryType = memoryType;
  if (category) where.category = category;

  const records = await prisma.agentMemory.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return records.map((r) => ({
    id: r.id,
    merchantId: r.merchantId,
    memoryType: r.memoryType as MemoryType,
    category: r.category as MemoryCategory,
    key: r.key,
    value: JSON.parse(r.value) as Record<string, unknown>,
    confidence: r.confidence,
    accessCount: r.accessCount,
    lastAccessedAt: r.lastAccessedAt,
    createdAt: r.createdAt,
  }));
}

export async function deleteMemory(
  merchantId: string,
  memoryType: MemoryType,
  category: MemoryCategory,
  key: string
): Promise<boolean> {
  try {
    await prisma.agentMemory.delete({
      where: {
        merchantId_memoryType_category_key: {
          merchantId,
          memoryType,
          category,
          key,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cleanupExpiredMemory(merchantId: string): Promise<number> {
  const result = await prisma.agentMemory.deleteMany({
    where: {
      merchantId,
      expiresAt: { not: null, lt: new Date() },
    },
  });
  return result.count;
}

export function createMemoryKey(...parts: string[]): string {
  return parts.join("::");
}
