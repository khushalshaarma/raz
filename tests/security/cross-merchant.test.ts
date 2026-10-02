import { describe, it, expect } from "vitest";

describe("Cross-Merchant Access Protection", () => {
  const MERCHANT_A = "merchant-a-123";
  const MERCHANT_B = "merchant-b-456";

  function validateMerchantAccess(
    requestMerchantId: string,
    resourceMerchantId: string
  ): { allowed: boolean; reason?: string } {
    if (!requestMerchantId || !resourceMerchantId) {
      return { allowed: false, reason: "Missing merchant identifiers" };
    }

    if (requestMerchantId !== resourceMerchantId) {
      return {
        allowed: false,
        reason: `Merchant ${requestMerchantId} cannot access resources of ${resourceMerchantId}`,
      };
    }

    return { allowed: true };
  }

  it("allows access to own resources", () => {
    const result = validateMerchantAccess(MERCHANT_A, MERCHANT_A);
    expect(result.allowed).toBe(true);
  });

  it("denies access to other merchants resources", () => {
    const result = validateMerchantAccess(MERCHANT_A, MERCHANT_B);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(MERCHANT_A);
    expect(result.reason).toContain(MERCHANT_B);
  });

  it("denies access with empty request merchant", () => {
    const result = validateMerchantAccess("", MERCHANT_A);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Missing merchant identifiers");
  });

  it("denies access with empty resource merchant", () => {
    const result = validateMerchantAccess(MERCHANT_A, "");
    expect(result.allowed).toBe(false);
  });

  it("denies access with both empty", () => {
    const result = validateMerchantAccess("", "");
    expect(result.allowed).toBe(false);
  });
});

describe("Secret Leakage Detection", () => {
  const SENSITIVE_FIELDS = [
    "password",
    "secret",
    "token",
    "apiKey",
    "api_key",
    "authorization",
    "creditCard",
    "cvv",
    "ssn",
  ];

  function containsSecret(obj: Record<string, any>): {
    leaked: boolean;
    fields: string[];
  } {
    const leakedFields: string[] = [];

    function checkValue(key: string, value: any): void {
      if (typeof value === "string" && value.length > 0) {
        const lowerKey = key.toLowerCase();
        if (
          SENSITIVE_FIELDS.some(
            (field) => lowerKey.includes(field.toLowerCase())
          )
        ) {
          leakedFields.push(key);
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      checkValue(key, value);
    }

    return { leaked: leakedFields.length > 0, fields: leakedFields };
  }

  it("detects password in object", () => {
    const result = containsSecret({ password: "secret123" });
    expect(result.leaked).toBe(true);
    expect(result.fields).toContain("password");
  });

  it("detects apiKey in object", () => {
    const result = containsSecret({ apiKey: "rk_test_123" });
    expect(result.leaked).toBe(true);
    expect(result.fields).toContain("apiKey");
  });

  it("detects authorization header", () => {
    const result = containsSecret({ authorization: "Bearer token123" });
    expect(result.leaked).toBe(true);
    expect(result.fields).toContain("authorization");
  });

  it("allows safe fields", () => {
    const result = containsSecret({
      name: "John",
      email: "john@example.com",
      amount: 100,
    });
    expect(result.leaked).toBe(false);
    expect(result.fields).toHaveLength(0);
  });

  it("detects multiple secrets", () => {
    const result = containsSecret({
      password: "pass",
      apiKey: "key",
      token: "tok",
    });
    expect(result.leaked).toBe(true);
    expect(result.fields).toHaveLength(3);
  });

  it("handles empty object", () => {
    const result = containsSecret({});
    expect(result.leaked).toBe(false);
  });
});
