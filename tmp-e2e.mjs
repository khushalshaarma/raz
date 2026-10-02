/**
 * End-to-end check of the production demo flow against `next start`
 * (NODE_ENV=production, the same mode Vercel runs).
 *
 * Usage: node tmp-e2e.mjs <baseUrl>
 */

const BASE = process.argv[2] || "http://127.0.0.1:3111";
const DEMO_PASSWORD = "Password123";

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures++;
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
}

async function main() {
  // 1. Homepage loads.
  const home = await fetch(BASE + "/");
  const homeHtml = await home.text();
  check("homepage 200", home.status === 200, `status=${home.status}`);
  check(
    "homepage does NOT show the old dead-end error",
    !homeHtml.includes("Demo merchant access is not enabled"),
  );
  check("homepage offers Merchant entry", homeHtml.includes("Merchant"));

  // 2. Merchant button -> server mints a real session.
  const demo = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const setCookies = demo.headers.getSetCookie?.() ?? [];
  const demoText = await demo.text();
  check("POST /api/auth/demo -> 200", demo.status === 200, `status=${demo.status} body=${demoText.slice(0, 160)}`);

  const cookie = setCookies.find((c) => c.startsWith("growthos_token="));
  check("httpOnly session cookie issued", Boolean(cookie));

  if (cookie) {
    const raw = cookie.split(";")[0].split("=")[1];
    const claims = decodeJwt(raw);

    // 3. Session is verified server-side with real, non-admin claims.
    check("role is MERCHANT", claims.role === "MERCHANT", `role=${claims.role}`);
    check("not ADMIN", claims.role !== "ADMIN");
    check("bound to exactly one merchantId", typeof claims.merchantId === "string");
    check("marked demoMode", claims.demoMode === true);
    check("cookie is HttpOnly", /HttpOnly/i.test(cookie));
    check("cookie is Secure in production", /Secure/i.test(cookie));
    check("cookie SameSite=Lax", /SameSite=Lax/i.test(cookie));

    const jar = "growthos_token=" + raw;
    const authed = { headers: { cookie: jar } };

    // 4. Dashboard loads for the demo session.
    const dash = await fetch(BASE + "/merchant/dashboard", authed);
    const dashHtml = await dash.text();
    check("GET /merchant/dashboard -> 200", dash.status === 200, `status=${dash.status}`);
    check("dashboard shows demo-mode indicator", dashHtml.includes("Demo mode"));

    // 5. Demo merchant data is visible.
    const overview = await fetch(BASE + "/api/merchant/overview", authed);
    const overviewBody = await overview.text();
    check("demo merchant overview returns data", overview.status === 200 && overviewBody.length > 50,
      `status=${overview.status} len=${overviewBody.length}`);

    const payments = await fetch(BASE + "/api/auth/me", authed);
    const me = await payments.json();
    check("/api/auth/me reports demoMode", me?.user?.demoMode === true, JSON.stringify(me?.user ?? {}).slice(0, 120));

    // 6/7. Role separation is preserved.
    const admin = await fetch(BASE + "/admin", { redirect: "manual", headers: { cookie: jar } });
    check("merchant cannot open /admin", admin.status >= 300 && admin.status < 400 || admin.status === 403,
      `status=${admin.status}`);

    const cust = await fetch(BASE + "/customer/shop", { redirect: "manual", headers: { cookie: jar } });
    check("merchant session cannot open /customer", cust.status >= 300 && cust.status < 400 || cust.status === 403,
      `status=${cust.status}`);

    const adminApi = await fetch(BASE + "/api/admin/dashboard", authed);
    check("merchant cannot call admin API", adminApi.status === 403, `status=${adminApi.status}`);

    // 8. Normal sign-in still works.
    const login = await fetch(BASE + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "arjun@urbanwear.in", password: DEMO_PASSWORD }),
    });
    const loginText = await login.text();
    check("normal sign-in still works", login.status === 200, `status=${login.status} ${loginText.slice(0, 120)}`);

    // 10. No secrets in responses.
    const leaks = [];
    const secret = process.env.JWT_SECRET || "";
    for (const [label, text] of [["home", homeHtml], ["demo", demoText], ["dashboard", dashHtml], ["overview", overviewBody], ["me", JSON.stringify(me)]]) {
      if (secret && text.includes(secret)) leaks.push(`${label}:JWT_SECRET`);
      if (text.includes(DEMO_PASSWORD)) leaks.push(`${label}:DEMO_PASSWORD`);
    }
    const dashCookies = dash.headers.getSetCookie?.() ?? [];
    if (dashCookies.some((c) => c.includes("growthos_token="))) leaks.push("dashboard:set-cookie-leak");
    check("no secrets exposed in responses", leaks.length === 0, leaks.join(", "));
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
