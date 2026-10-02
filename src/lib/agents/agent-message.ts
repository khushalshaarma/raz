import { prisma } from "@/lib/prisma";
import type { AgentType, MessageType } from "./types";

export async function createAgentMessage(params: {
  merchantId: string;
  growthCycleId?: string;
  senderAgent: AgentType;
  receiverAgent: AgentType;
  messageType: MessageType;
  payload: Record<string, unknown>;
  agentRunId?: string;
  taskId?: string;
}): Promise<string> {
  const record = await prisma.agentMessage.create({
    data: {
      merchantId: params.merchantId,
      growthCycleId: params.growthCycleId,
      senderAgent: params.senderAgent,
      receiverAgent: params.receiverAgent,
      messageType: params.messageType,
      payload: JSON.stringify(params.payload),
      agentRunId: params.agentRunId,
      taskId: params.taskId,
    },
  });
  return record.id;
}

export async function getMessagesForCycle(
  merchantId: string,
  growthCycleId: string
): Promise<Array<{
  id: string;
  senderAgent: string;
  receiverAgent: string;
  messageType: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}>> {
  const where: Record<string, unknown> = { merchantId };
  if (growthCycleId) {
    where.growthCycleId = growthCycleId;
  }
  const messages = await prisma.agentMessage.findMany({
    where,
    orderBy: { timestamp: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    senderAgent: m.senderAgent,
    receiverAgent: m.receiverAgent,
    messageType: m.messageType,
    payload: JSON.parse(m.payload) as Record<string, unknown>,
    timestamp: m.timestamp,
  }));
}

export async function getMessagesBetweenAgents(
  merchantId: string,
  growthCycleId: string,
  sender: AgentType,
  receiver: AgentType
): Promise<Array<{ payload: Record<string, unknown>; timestamp: Date }>> {
  const where: Record<string, unknown> = {
    merchantId,
    senderAgent: sender,
    receiverAgent: receiver,
  };
  if (growthCycleId) {
    where.growthCycleId = growthCycleId;
  }
  const messages = await prisma.agentMessage.findMany({
    where,
    orderBy: { timestamp: "asc" },
  });

  return messages.map((m) => ({
    payload: JSON.parse(m.payload) as Record<string, unknown>,
    timestamp: m.timestamp,
  }));
}
