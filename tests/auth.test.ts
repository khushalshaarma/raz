import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "@/lib/auth";

describe("auth library", () => {
  describe("password hashing", () => {
    it("hashes and verifies a password", async () => {
      const hash = await hashPassword("Password123");
      expect(hash).not.toBe("Password123");
      expect(await verifyPassword("Password123", hash)).toBe(true);
    });

    it("rejects a wrong password", async () => {
      const hash = await hashPassword("Password123");
      expect(await verifyPassword("WrongPass1", hash)).toBe(false);
    });

    it("produces unique hashes for the same password", async () => {
      const h1 = await hashPassword("Password123");
      const h2 = await hashPassword("Password123");
      expect(h1).not.toBe(h2);
    });
  });

  describe("JWT signing and verification", () => {
    it("signs and verifies a token with role payload", async () => {
      const token = await signToken({
        userId: "user-1",
        email: "a@b.com",
        role: "MERCHANT",
        merchantId: "merchant-1",
      });
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("MERCHANT");
      expect(payload!.merchantId).toBe("merchant-1");
      expect(payload!.userId).toBe("user-1");
    });

    it("rejects a tampered token", async () => {
      const token = await signToken({
        userId: "user-1",
        email: "a@b.com",
        role: "CUSTOMER",
      });
      const tampered = token.slice(0, -2) + "xx";
      expect(await verifyToken(tampered)).toBeNull();
    });

    it("rejects a garbage token", async () => {
      expect(await verifyToken("not.a.token")).toBeNull();
    });

    it("preserves role for authorization decisions", async () => {
      const adminToken = await signToken({
        userId: "admin-1",
        email: "admin@growthos.in",
        role: "ADMIN",
      });
      const customerToken = await signToken({
        userId: "cust-1",
        email: "cust@example.com",
        role: "CUSTOMER",
      });
      const adminPayload = await verifyToken(adminToken);
      const customerPayload = await verifyToken(customerToken);
      expect(adminPayload!.role).toBe("ADMIN");
      expect(customerPayload!.role).toBe("CUSTOMER");
    });
  });
});
