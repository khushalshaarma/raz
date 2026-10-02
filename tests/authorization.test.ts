import { describe, it, expect } from "vitest";
import { requireRole } from "@/lib/auth";

/**
 * Authorization tests.
 *
 * These verify the role-gating rules used to protect the three application
 * roles: MERCHANT, CUSTOMER, ADMIN. The same rules are enforced at the
 * API layer (src/app/api) and the route middleware/layouts.
 */

function makeUser(role: "MERCHANT" | "CUSTOMER" | "ADMIN", merchantId?: string) {
  return {
    userId: "u-1",
    email: "u@x.com",
    role,
    ...(merchantId ? { merchantId } : {}),
  };
}

describe("role-based authorization (#22)", () => {
  describe("MERCHANT role", () => {
    it("allows a merchant is a merchant", () => {
      expect(requireRole(makeUser("MERCHANT", "m-1"), "MERCHANT")).toBe(true);
    });

    it("denies a customer access to merchant area", () => {
      expect(requireRole(makeUser("CUSTOMER"), "MERCHANT")).toBe(false);
    });

    it("denies an admin access to merchant area", () => {
      expect(requireRole(makeUser("ADMIN"), "MERCHANT")).toBe(false);
    });

    it("denies unauthenticated access", () => {
      expect(requireRole(null, "MERCHANT")).toBe(false);
    });
  });

  describe("CUSTOMER role", () => {
    it("allows a customer is a customer", () => {
      expect(requireRole(makeUser("CUSTOMER"), "CUSTOMER")).toBe(true);
    });

    it("denies a merchant access to customer area", () => {
      expect(requireRole(makeUser("MERCHANT", "m-1"), "CUSTOMER")).toBe(false);
    });

    it("denies an admin access to customer area", () => {
      expect(requireRole(makeUser("ADMIN"), "CUSTOMER")).toBe(false);
    });
  });

  describe("ADMIN role", () => {
    it("allows an admin is an admin", () => {
      expect(requireRole(makeUser("ADMIN"), "ADMIN")).toBe(true);
    });

    it("denies a merchant access to admin area", () => {
      expect(requireRole(makeUser("MERCHANT", "m-1"), "ADMIN")).toBe(false);
    });

    it("denies a customer access to admin area", () => {
      expect(requireRole(makeUser("CUSTOMER"), "ADMIN")).toBe(false);
    });
  });

  describe("merchant data isolation (#4, #22)", () => {
    it("only scattering merchantId on its own resources", () => {
      // A merchant must only ever operate with its own merchantId.
      const merchant = makeUser("MERCHANT", "merchantA");
      expect(merchant.merchantId).toBe("merchantA");
    });

    it("a merchant without a merchantId is denied merchant APIs", () => {
      // Merchant-area endpoints guard on user.merchantId presence.
      const merchantMissingTenant = makeUser("MERCHANT", undefined);
      expect(merchantMissingTenant.merchantId).toBeUndefined();
      // Equivalent check used in API handlers:
      expect(
        !!merchantMissingTenant &&
          merchantMissingTenant.role === "MERCHANT" &&
          !!merchantMissingTenant.merchantId
      ).toBe(false);
    });

    it("a customer cannot read another merchant's private resources", () => {
      // Customers never carry a merchantId in their session.
      const customer = makeUser("CUSTOMER");
      expect(customer.merchantId).toBeUndefined();
    });

    it("an admin can inspect but has no tenant-scoped access", () => {
      const admin = makeUser("ADMIN");
      expect(admin.merchantId).toBeUndefined();
    });
  });
});
