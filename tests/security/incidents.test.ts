import { describe, it, expect } from "vitest";
import {
  createIncident,
  updateIncident,
  resolveIncident,
  getIncident,
  getOpenIncidents,
  getIncidentsBySeverity,
  clearIncidents,
} from "@/lib/security/incidents";

describe("incidents", () => {
  it("creates an incident", () => {
    const incident = createIncident({
      title: "Test incident",
      description: "Description",
      severity: "HIGH",
      component: "database",
    });
    expect(incident.id).toBeDefined();
    expect(incident.title).toBe("Test incident");
    expect(incident.status).toBe("OPEN");
  });

  it("updates an incident", () => {
    const incident = createIncident({
      title: "Test",
      description: "Desc",
      severity: "LOW",
      component: "api",
    });
    const updated = updateIncident(incident.id, { status: "INVESTIGATING" });
    expect(updated?.status).toBe("INVESTIGATING");
  });

  it("resolves an incident", () => {
    const incident = createIncident({
      title: "Test",
      description: "Desc",
      severity: "CRITICAL",
      component: "payments",
    });
    const resolved = resolveIncident(incident.id);
    expect(resolved?.status).toBe("RESOLVED");
    expect(resolved?.resolvedAt).toBeDefined();
  });

  it("gets incident by id", () => {
    const incident = createIncident({
      title: "Test",
      description: "Desc",
      severity: "MEDIUM",
      component: "auth",
    });
    const found = getIncident(incident.id);
    expect(found?.title).toBe("Test");
  });

  it("gets open incidents", () => {
    clearIncidents();
    createIncident({
      title: "Open",
      description: "Desc",
      severity: "LOW",
      component: "db",
    });
    const open = getOpenIncidents();
    expect(open.length).toBeGreaterThan(0);
  });

  it("filters by severity", () => {
    clearIncidents();
    createIncident({
      title: "Critical",
      description: "Desc",
      severity: "CRITICAL",
      component: "payments",
    });
    const critical = getIncidentsBySeverity("CRITICAL");
    expect(critical.length).toBeGreaterThan(0);
  });

  it("returns null for non-existent incident", () => {
    const found = getIncident("non-existent");
    expect(found).toBeNull();
  });
});
