import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "growthos-dev-secret-change-in-production-2026"
);

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeToken(payload: Record<string, unknown>, secret: string) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

const MERCHANT_PAYLOAD = {
  userId: "u1",
  email: "arjun@urbanwear.in",
  role: "MERCHANT",
  merchantId: "m1",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

async function callMiddleware(url: string, token?: string) {
  const { middleware } = await import("@/middleware");
  const headers = new Headers();
  if (token) headers.set("cookie", `growthos_token=${token}`);
  const request = new NextRequest(new Request(url, { headers }));
  return middleware(request);
}

describe("middleware API authentication responses", () => {
  it("returns a JSON 401 (not an HTML redirect) for an API call with an invalid token", async () => {
    const badToken = makeToken(MERCHANT_PAYLOAD, "wrong-secret-entirely");
    const res = await callMiddleware("http://localhost/api/merchant/payments", badToken);

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    // No redirect: an API client must never be handed the login page, because
    // `await res.json()` on HTML is what surfaced as "Network error".
    expect(res.headers.get("location")).toBeNull();

    const body = await res.json();
    expect(body.sessionInvalid).toBe(true);
    expect(JSON.stringify(body)).not.toContain("<html");
  });

  it("returns a JSON 401 for an API call with no token", async () => {
    const res = await callMiddleware("http://localhost/api/merchant/payments");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects a page navigation with an invalid token to /login", async () => {
    const badToken = makeToken(MERCHANT_PAYLOAD, "wrong-secret-entirely");
    const res = await callMiddleware("http://localhost/merchant/orders", badToken);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets a valid merchant session through to an API route", async () => {
    const token = makeToken(MERCHANT_PAYLOAD, process.env.JWT_SECRET || "growthos-dev-secret-change-in-production-2026");
    const res = await callMiddleware("http://localhost/api/merchant/payments", token);
    expect(res.status).toBe(200);
  });

  it("keeps the webhook route reachable", async () => {
    const res = await callMiddleware("http://localhost/api/webhooks/razorpay");
    // Webhooks are authenticated by their own signature header, not by session.
    expect(res.status).not.toBe(307);
  });
});