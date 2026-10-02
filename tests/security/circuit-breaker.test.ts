import { describe, it, expect, beforeEach } from "vitest";
import {
  checkCircuitBreaker,
  recordCircuitSuccess,
  recordCircuitFailure,
  resetCircuit,
  resetAllCircuits,
  getCircuitState,
} from "@/lib/security/circuit-breaker";

describe("circuit-breaker", () => {
  beforeEach(() => resetAllCircuits());

  describe("basic states", () => {
    it("starts in CLOSED state", () => {
      const result = checkCircuitBreaker("test-circuit");
      expect(result.allowed).toBe(true);
      expect(result.state).toBe("CLOSED");
    });

    it("records failure and counts", () => {
      recordCircuitFailure("test-circuit");
      recordCircuitFailure("test-circuit");
      const result = checkCircuitBreaker("test-circuit");
      expect(result.failureCount).toBe(2);
    });

    it("transitions to OPEN after threshold", () => {
      const config = { failureThreshold: 3 };
      recordCircuitFailure("test-circuit", config);
      recordCircuitFailure("test-circuit", config);
      recordCircuitFailure("test-circuit", config);
      const result = checkCircuitBreaker("test-circuit", config);
      expect(result.allowed).toBe(false);
      expect(result.state).toBe("OPEN");
    });

    it("resets on success", () => {
      recordCircuitFailure("test-circuit");
      recordCircuitSuccess("test-circuit");
      const result = checkCircuitBreaker("test-circuit");
      expect(result.state).toBe("CLOSED");
      expect(result.failureCount).toBe(0);
    });
  });

  describe("HALF_OPEN state", () => {
    it("transitions to HALF_OPEN after recovery timeout", () => {
      const config = { failureThreshold: 2, recoveryTimeoutMs: 0 };
      recordCircuitFailure("test-circuit", config);
      recordCircuitFailure("test-circuit", config);
      checkCircuitBreaker("test-circuit", config);
      const result = checkCircuitBreaker("test-circuit", config);
      expect(result.state).toBe("HALF_OPEN");
    });
  });

  describe("reset", () => {
    it("resets circuit", () => {
      recordCircuitFailure("test-circuit");
      resetCircuit("test-circuit");
      const state = getCircuitState("test-circuit");
      expect(state.failureCount).toBe(0);
    });
  });
});
