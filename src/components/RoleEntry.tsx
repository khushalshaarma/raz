"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type EntryTone = "error" | "info";

/**
 * Role selection on the landing page.
 *
 * Merchant is a presentation shortcut: it asks the server to start a real demo
 * session and then navigates to the merchant dashboard, skipping the sign-in
 * form. It only navigates AFTER the server has confirmed the session was
 * created — a plain redirect would bounce straight back to /login because the
 * dashboard is guarded.
 *
 * Admin and Customer deliberately keep their existing behaviour (plain links to
 * `/admin` and `/customer/shop`, which the middleware sends to the normal
 * sign-in flow when there is no session).
 */
export function RoleEntry() {
  const [merchantStatus, setMerchantStatus] = useState<EntryTone | null>(null);
  const [merchantMessage, setMerchantMessage] = useState("");
  const [startingDemo, setStartingDemo] = useState(false);
  // A ref guard (not just state) so two rapid clicks in the same tick cannot
  // both fire a request and mint two sessions.
  const inFlight = useRef(false);

  async function startDemoMerchantSession() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStartingDemo(true);
    setMerchantStatus(null);
    setMerchantMessage("");

    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Parse defensively: an expired/misconfigured deployment may return HTML
      // (e.g. a proxy error page) and `res.json()` would otherwise throw and be
      // reported as a generic failure.
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setMerchantStatus("error");
        setMerchantMessage(
          res.status === 404
            ? "Demo merchant access is not enabled on this server. Use Sign In."
            : data?.error || `Could not start the demo session (HTTP ${res.status}).`
        );
        return;
      }

      if (data?.user?.role !== "MERCHANT") {
        setMerchantStatus("error");
        setMerchantMessage("Unexpected demo session. Use Sign In instead.");
        return;
      }

      // Full navigation so the server-rendered dashboard and middleware both
      // observe the freshly issued cookie (a client-side push could be served
      // from a stale router cache).
      window.location.assign(data.redirectTo || "/merchant/dashboard");
    } catch {
      setMerchantStatus("error");
      setMerchantMessage("Could not reach the server to start the demo session. Try Sign In.");
    } finally {
      inFlight.current = false;
      setStartingDemo(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4 text-sm pt-8">
        <button
          type="button"
          onClick={() => void startDemoMerchantSession()}
          disabled={startingDemo}
          aria-busy={startingDemo}
          className="p-4 rounded-lg border border-growthos-border hover:border-growthos-accent/50 transition-colors text-left disabled:opacity-60 disabled:cursor-progress"
        >
          <div className="font-medium text-growthos-text">
            {startingDemo ? "Starting demo…" : "Merchant"}
          </div>
          <div className="text-growthos-muted text-xs mt-1">Business dashboard</div>
        </button>

        <Link
          href="/customer/shop"
          className="p-4 rounded-lg border border-growthos-border hover:border-growthos-accent/50 transition-colors"
        >
          <div className="font-medium text-growthos-text">Customer</div>
          <div className="text-growthos-muted text-xs mt-1">Browse products</div>
        </Link>

        <Link
          href="/admin"
          className="p-4 rounded-lg border border-growthos-border hover:border-growthos-accent/50 transition-colors"
        >
          <div className="font-medium text-growthos-text">Admin</div>
          <div className="text-growthos-muted text-xs mt-1">Platform overview</div>
        </Link>
      </div>

      {merchantStatus && (
        <div
          role="status"
          className={`text-sm ${
            merchantStatus === "error" ? "text-red-400" : "text-growthos-muted"
          }`}
        >
          {merchantMessage}
        </div>
      )}
    </div>
  );
}