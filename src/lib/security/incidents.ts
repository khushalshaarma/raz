import { randomUUID } from "crypto";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "MITIGATED" | "RESOLVED";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  component: string;
  merchantId?: string;
  error?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

const incidents = new Map<string, Incident>();

export function createIncident(params: {
  title: string;
  description: string;
  severity: IncidentSeverity;
  component: string;
  merchantId?: string;
  error?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}): Incident {
  const id = randomUUID();
  const now = new Date();
  const incident: Incident = {
    id,
    title: params.title,
    description: params.description,
    severity: params.severity,
    status: "OPEN",
    component: params.component,
    merchantId: params.merchantId,
    error: params.error,
    stack: params.stack,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  };
  incidents.set(id, incident);
  return incident;
}

export function updateIncident(
  id: string,
  updates: Partial<Pick<Incident, "status" | "description" | "severity" | "resolvedAt">>
): Incident | null {
  const incident = incidents.get(id);
  if (!incident) return null;
  Object.assign(incident, updates, { updatedAt: new Date() });
  return incident;
}

export function resolveIncident(id: string): Incident | null {
  return updateIncident(id, { status: "RESOLVED", resolvedAt: new Date() });
}

export function getIncident(id: string): Incident | null {
  return incidents.get(id) ?? null;
}

export function getOpenIncidents(): Incident[] {
  return Array.from(incidents.values()).filter(
    (i) => i.status === "OPEN" || i.status === "INVESTIGATING"
  );
}

export function getIncidentsBySeverity(severity: IncidentSeverity): Incident[] {
  return Array.from(incidents.values()).filter((i) => i.severity === severity);
}

export function getIncidentsByComponent(component: string): Incident[] {
  return Array.from(incidents.values()).filter((i) => i.component === component);
}

export function clearIncidents(): void {
  incidents.clear();
}
