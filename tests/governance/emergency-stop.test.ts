import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkEmergencyStop, enableEmergencyStop, disableEmergencyStop } from "@/lib/governance/emergency-stop";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
  await prisma.$executeRawUnsafe(`INSERT INTO systemHealth (id, application, api, database, environment, lastCheckedAt) VALUES ('test-hk-${Date.now()}', 'ok', 'ok', 'ok', 'test', datetime('now'))`);
}

describe("emergency-stop", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("emergency stop ON", () => {
    it("ALL automated actions are blocked when emergency stop is enabled", async () => {
      await enableEmergencyStop("admin-1", "Test emergency");
      const result = await checkEmergencyStop();
      expect(result.enabled).toBe(true);
      expect(result.allActionsBlocked).toBe(true);
      expect(result.reason).toBe("GLOBAL_EMERGENCY_STOP");
    });
  });

  describe("emergency stop OFF", () => {
    it("normal governance resumes when emergency stop is disabled", async () => {
      await enableEmergencyStop("admin-1", "Test");
      await disableEmergencyStop("admin-1");
      const result = await checkEmergencyStop();
      expect(result.enabled).toBe(false);
      expect(result.allActionsBlocked).toBe(false);
    });
    it("checkEmergencyStop returns enabled=false and allActionsBlocked=false by default", async () => {
      const result = await checkEmergencyStop();
      expect(result.enabled).toBe(false);
      expect(result.allActionsBlocked).toBe(false);
    });
  });
});
