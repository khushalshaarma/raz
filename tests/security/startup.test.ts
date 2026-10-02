import { describe, it, expect } from "vitest";
import {
  validateProductionConfig,
  shouldBlockStartup,
} from "@/lib/config/startup";

describe("startup validation", () => {
  describe("validateProductionConfig", () => {
    it("skips strict validation in non-production", () => {
      const checks = validateProductionConfig();
      expect(checks.length).toBeGreaterThan(0);
      const envModeCheck = checks.find((c) => c.name === "env-mode");
      expect(envModeCheck?.passed).toBe(true);
    });
  });

  describe("shouldBlockStartup", () => {
    it("does not block in non-production", () => {
      const checks = validateProductionConfig();
      const shouldBlock = shouldBlockStartup(checks);
      expect(shouldBlock).toBe(false);
    });
  });
});
