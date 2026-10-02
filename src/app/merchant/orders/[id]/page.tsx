"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export default function OrderDetailPage() {
  const { id } = useParams() as { id?: string };
  const [order, setOrder] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<{ tone: "error" | "info" | "success"; message: string } | null>(null);
  // Retained so verification can be retried WITHOUT re-opening Razorpay
  // Checkout: the customer already paid, only our verification round-trip failed.
  const pendingPaymentRef = useRef<{
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  } | null>(null);
  // Mirrors the ref so the UI re-renders when a payment becomes pending.
  const [hasPendingPayment, setHasPendingPayment] = useState(false);

  const fetchOrder = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/orders/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to load order");
        setOrder(null);
      } else {
        setOrder(data.order);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      setError("Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const allowedTargets = order ? STATUS_TRANSITIONS[order.status] || [] : [];

  async function handleStatusChange(newStatus: string) {
    if (!order || !id) return;
    setUpdating(newStatus);
    try {
      const res = await fetch(`/api/merchant/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.message || "Failed to update status");
      } else {
        await fetchOrder();
      }
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Verify a Razorpay payment with the backend.
   *
   * The Razorpay success callback is NOT proof of payment — only this server
   * round-trip, which checks the signature against the key secret and reads the
   * authoritative amount/status from Razorpay, is. Distinguishes transport
   * failures (retryable, payment id preserved) from validation/signature
   * failures (not retryable) so the customer is never asked to pay twice for a
   * payment that only our verification round-trip lost.
   */
  const verifyPayment = useCallback(async () => {
    const pending = pendingPaymentRef.current;
    if (!pending || !id) return;

    setVerifying(true);
    try {
      const res = await fetch("/api/merchant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantOrderId: id,
          razorpay_order_id: pending.razorpay_order_id,
          razorpay_payment_id: pending.razorpay_payment_id,
          razorpay_signature: pending.razorpay_signature,
        }),
      });

      // Safely parse the body regardless of content type.
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      // Session lost / not authenticated: the middleware would previously have
      // redirected to the HTML login page here, making this look like a network
      // error. It now returns a JSON 401 and we can say so precisely.
      if (res.status === 401) {
        setPaymentNotice({
          tone: "error",
          message:
            data?.message ||
            "Your session expired. Your payment is saved with Razorpay — sign in again and use “Retry verification” (do not pay again).",
        });
        return;
      }

      if (!res.ok) {
        const message =
          data?.message ||
          data?.error ||
          `Verification failed (HTTP ${res.status}).`;
        setPaymentNotice({
          tone: "error",
          message: data?.retryable
            ? `${message} Your payment is recorded with Razorpay — use “Retry verification”, do not pay again.`
            : message,
        });
        return;
      }

      if (data?.captured === false) {
        // Verification itself succeeded, so there is nothing left to retry — the
        // payment is recorded with Razorpay and will settle via webhook.
        pendingPaymentRef.current = null;
        setHasPendingPayment(false);
        setPaymentNotice({
          tone: "info",
          message: data.message || "Payment received but not yet captured. It will update once Razorpay confirms capture.",
        });
        await fetchOrder();
        return;
      }

      // Backend confirmed the payment. Only now is it safe to clear the pending
      // payment and report success.
      pendingPaymentRef.current = null;
      setHasPendingPayment(false);
      setPaymentNotice({ tone: "success", message: "Payment verified and recorded." });
      await fetchOrder();
    } catch {
      // True transport failure (offline, server unreachable). Keep the payment
      // id so the customer can retry verification later without paying again.
      setPaymentNotice({
        tone: "error",
        message:
          "Could not reach the server to verify the payment. Your payment is recorded with Razorpay — use “Retry verification”, do not pay again.",
      });
    } finally {
      setVerifying(false);
    }
  }, [id]);

  async function handlePayNow() {
    if (!order || !id || paying) return;
    setPaying(true);
    setPaymentNotice(null);
    try {
      const res = await fetch(`/api/merchant/orders/${id}/pay`, { method: "POST" });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        setPaymentNotice({
          tone: "error",
          message: data?.error || data?.message || `Could not start payment (HTTP ${res.status}).`,
        });
        return;
      }

      // Ensure Razorpay checkout script is loaded
      if (!(window as any).Razorpay) {
        const existing = document.querySelector("script[data-razorpay-checkout]");
        if (!existing) {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.async = true;
          s.setAttribute("data-razorpay-checkout", "true");
          document.body.appendChild(s);
          await new Promise<void>((resolve, reject) => {
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Failed to load Razorpay script"));
          });
        } else {
          // Wait for Razorpay to become available if script is already inserted
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout waiting for Razorpay")), 10000);
            const interval = setInterval(() => {
              if ((window as any).Razorpay) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
              }
            }, 100);
          });
        }
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "GrowthOS Payment",
        description: `Payment for Order ${order.id}`,
        order_id: data.razorpayOrderId,
        handler: (response: any) => {
          // Persist the payment identifiers BEFORE verifying so a failed
          // round-trip can be retried without paying again.
          pendingPaymentRef.current = {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          };
          setHasPendingPayment(true);
          void verifyPayment();
        },
        modal: {
          ondismiss: () => {
            setPaymentNotice({ tone: "info", message: "Payment cancelled." });
          },
        },
        prefill: {
          name: "GrowthOS Demo",
          email: "test@growthos.in",
        },
        theme: { color: "#3399cc" },
      };

      // @ts-ignore
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      setPaymentNotice({
        tone: "error",
        message: err instanceof Error && err.message.includes("Razorpay")
          ? "Could not load the Razorpay checkout. Check your connection and try again."
          : "Could not start the payment. Please try again.",
      });
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading...</div></div>;
  }

  if (error || !order) {
    return <div className="space-y-4">
      <Link href="/merchant/orders" className="text-growthos-muted hover:text-growthos-text">← Back to Orders</Link>
      <div className="text-red-400">{error || "Order not found"}</div>
    </div>;
  }

  const payments: any[] = Array.isArray(order.payments) ? order.payments : [];
  // Show the most recent payment, not an arbitrary one.
  const payment = payments.length > 0
    ? payments.reduce((latest, p) => (new Date(p.createdAt) > new Date(latest.createdAt) ? p : latest))
    : undefined;
  const paid = payments.some((p: any) => p.status === "CAPTURED");
  const canRetryVerification = hasPendingPayment;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/merchant/orders" className="text-growthos-muted hover:text-growthos-text">← Back</Link>
          <h1 className="text-2xl font-bold text-growthos-text mt-2">Order Details</h1>
          <p className="text-growthos-muted text-sm">Order ID: {order.id}</p>
        </div>
        <div className="flex gap-2">
          {allowedTargets.map((target) => (
            <button
              key={target}
              disabled={updating === target}
              onClick={() => handleStatusChange(target)}
              className="px-3 py-2 bg-growthos-surface border border-growthos-border rounded-lg text-sm text-growthos-text hover:border-growthos-accent/30 transition-colors disabled:opacity-50"
            >
              {updating === target ? "Updating..." : `Set ${target}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-growthos-muted text-sm">Customer</div>
          <div className="text-growthos-text font-medium mt-1">{order.customer?.name}</div>
          <div className="text-growthos-muted text-xs">{order.customer?.email}</div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-growthos-muted text-sm">Status</div>
          <div className="mt-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.status === "COMPLETED" ? "bg-green-500/10 text-green-400" : order.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" : order.status === "CANCELLED" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>{order.status}</span>
          </div>
        </div>
        <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
          <div className="text-growthos-muted text-sm">Payment</div>
          <div className="mt-1 text-growthos-text font-medium">{payment?.status || "No payment recorded"}</div>
          {payment?.providerPaymentId && (
            <div className="text-growthos-muted text-xs break-all">Razorpay: {payment.providerPaymentId}</div>
          )}
          {paid && (
            <div className="mt-2 text-green-400 text-sm">Paid ✓</div>
          )}
          {!paid && canRetryVerification && (
            <button
              onClick={() => void verifyPayment()}
              disabled={verifying}
              className="mt-2 px-3 py-1.5 bg-growthos-accent text-white rounded-lg text-sm font-medium hover:bg-growthos-accent/80 disabled:opacity-50"
            >
              {verifying ? "Verifying..." : "Retry verification"}
            </button>
          )}
          {!paid && !canRetryVerification && (
            <button
              onClick={handlePayNow}
              disabled={paying}
              className="mt-2 px-3 py-1.5 bg-growthos-accent text-white rounded-lg text-sm font-medium hover:bg-growthos-accent/80 disabled:opacity-50"
            >
              {paying ? "Processing..." : "Pay via Razorpay"}
            </button>
          )}
          {paymentNotice && (
            <div
              className={`mt-2 text-sm ${
                paymentNotice.tone === "error"
                  ? "text-red-400"
                  : paymentNotice.tone === "success"
                    ? "text-green-400"
                    : "text-growthos-muted"
              }`}
            >
              {paymentNotice.message}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
        <h2 className="text-lg font-semibold text-growthos-text mb-3">Items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-growthos-muted border-b border-growthos-border">
              <th className="text-left py-2">Product</th>
              <th className="text-left py-2">Qty</th>
              <th className="text-right py-2">Unit</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item: any) => (
              <tr key={item.id} className="border-b border-growthos-border/50">
                <td className="py-2 text-growthos-text">{item.product?.name}</td>
                <td className="py-2 text-growthos-muted">{item.quantity}</td>
                <td className="py-2 text-right text-growthos-text">₹{(item.priceMinor / 100).toFixed(2)}</td>
                <td className="py-2 text-right text-growthos-text">₹{(item.totalMinor / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
        <h2 className="text-lg font-semibold text-growthos-text mb-3">Financials</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-growthos-muted">Subtotal</span><span className="text-growthos-text">₹{(order.subtotalMinor / 100).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-growthos-muted">Discount</span><span className="text-growthos-text">₹{(order.discountMinor / 100).toFixed(2)}</span></div>
          <div className="flex justify-between font-medium text-growthos-text"><span>Total</span><span>₹{(order.totalMinor / 100).toFixed(2)}</span></div>
        </div>
      </div>

      <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
        <h2 className="text-lg font-semibold text-growthos-text mb-3">Audit History</h2>
        {auditLogs.length === 0 ? (
          <div className="text-growthos-muted text-sm">No audit events for this order.</div>
        ) : (
          <div className="space-y-2">
            {auditLogs.map((log: any) => (
              <div key={log.id} className="text-sm text-growthos-muted">
                <span className="text-growthos-text">{log.action}</span> — {new Date(log.createdAt).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
