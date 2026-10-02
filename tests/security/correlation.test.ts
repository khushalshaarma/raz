import { describe, it, expect } from "vitest";
import {
  generateCorrelationId,
  buildCorrelationId,
  parseCorrelationId,
  correlationHeaders,
} from "@/lib/observability/correlation";

describe("correlation", () => {
  describe("generateCorrelationId", () => {
    it("generates unique IDs", () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("buildCorrelationId", () => {
    it("builds from components", () => {
      const id = buildCorrelationId({
        requestId: "req-1",
        growthCycleId: "gc-1",
        merchantId: "m-1",
      });
      expect(id).toContain("req:req-1");
      expect(id).toContain("gc:gc-1");
      expect(id).toContain("m:m-1");
    });

    it("builds empty for no components", () => {
      const id = buildCorrelationId({});
      expect(id).toBe("");
    });
  });

  describe("parseCorrelationId", () => {
    it("parses components back", () => {
      const id = buildCorrelationId({
        requestId: "req-1",
        executionId: "exec-1",
      });
      const parsed = parseCorrelationId(id);
      expect(parsed.requestId).toBe("req-1");
      expect(parsed.executionId).toBe("exec-1");
    });
  });

  describe("correlationHeaders", () => {
    it("returns x-correlation-id header", () => {
      const headers = correlationHeaders("test-id");
      expect(headers["x-correlation-id"]).toBe("test-id");
    });
  });
});
