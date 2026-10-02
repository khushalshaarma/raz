"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

type Product = { id: string; name: string; sku: string; priceMinor: number; stock: number };
type Customer = { id: string; name: string; email: string; phone?: string };
type CartItem = { product: Product; quantity: number };

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Create modal state
  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load orders on mount
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/orders");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || "Failed to load orders");
      } else {
        setOrders(data.orders || []);
      }
    } catch (err) {
      setError("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Pre-load customers and products when modal opens
  const fetchCustomersProducts = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        fetch("/api/merchant/customers"),
        fetch("/api/merchant/products"),
      ]);
      const custData = await custRes.json();
      const prodData = await prodRes.json();
      if (custRes.ok) setCustomers(custData.customers || []);
      if (prodRes.ok) setProducts(prodData.products || []);
    } catch (e) {
      // ignore
    }
  };

  const openModal = async () => {
    await fetchCustomersProducts();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCustomerId("");
    setCart([]);
    setDiscount(0);
    setNotes("");
    setCreateError(null);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!selectedCustomerId) return setCreateError("Select a customer");
    if (cart.length === 0) return setCreateError("Add at least one product");

    for (const ci of cart) {
      if (ci.quantity <= 0) return setCreateError(`Invalid quantity for ${ci.product.name}`);
    }

    const subtotal = cart.reduce((s, c) => s + c.product.priceMinor * c.quantity, 0);
    if (discount < 0 || discount > subtotal) return setCreateError("Discount must be between 0 and subtotal");

    const items = cart.map((ci) => ({ productId: ci.product.id, quantity: ci.quantity }));

    try {
      const res = await fetch("/api/merchant/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          items,
          discountMinor: discount,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.message || "Failed to create order");
      } else {
        closeModal();
        setSuccessMessage(`Order created: ${data.order?.id?.substring(0, 8)}...`);
        // Refresh orders list
        fetchOrders();
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err) {
      setCreateError("Network error");
    }
  };

  // Filter & sort
  const processed = useMemo(() => {
    let list = [...orders];

    if (statusFilter !== "ALL") {
      list = list.filter((o) => o.status === statusFilter);
    }
    if (paymentFilter !== "ALL") {
      list = list.filter((o) => {
        const p = o.payments?.[0]?.status;
        if (paymentFilter === "PAID") return p === "CAPTURED";
        if (paymentFilter === "PENDING") return p === "PENDING" || p === "CREATED" || p === "AUTHORIZED";
        if (paymentFilter === "FAILED") return p === "FAILED";
        return false;
      });
    }
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        (o.customer?.name || "").toLowerCase().includes(q) || (o.customer?.email || "").toLowerCase().includes(q)
      );
    }

    if (sortBy === "date") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      list.sort((a, b) => b.totalMinor - a.totalMinor);
    }

    return list;
  }, [orders, statusFilter, paymentFilter, search, sortBy]);

  const pageCount = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paginated = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalValue = orders.reduce((s, o) => s + o.totalMinor, 0);
  const pending = orders.filter((o) => o.status === "PENDING").length;
  const completed = orders.filter((o) => o.status === "COMPLETED" || o.status === "DELIVERED").length;
  const cancelled = orders.filter((o) => o.status === "CANCELLED").length;

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-3 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20">
          {successMessage}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-growthos-text">Order Management</h1>
          <p className="text-growthos-muted text-sm mt-1">Create, track, and manage merchant orders in one place.</p>
        </div>
        <button
          onClick={openModal}
          className="px-4 py-2 bg-growthos-accent text-white rounded-lg text-sm font-medium hover:bg-growthos-accent/80 transition-colors"
        >
          + Create Order
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-growthos-muted text-sm">Total Orders</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{orders.length}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-growthos-muted text-sm">Total Value</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{formatINR(totalValue)}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-growthos-muted text-sm">Pending</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{pending}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-growthos-muted text-sm">Completed</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{completed}</div>
          </div>
          <div className="p-4 bg-growthos-surface border border-growthos-border rounded-xl">
            <div className="text-growthos-muted text-sm">Cancelled</div>
            <div className="text-2xl font-bold text-growthos-text mt-1">{cancelled}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-growthos-surface border border-growthos-border text-growthos-text text-sm rounded-lg px-3 py-1.5">
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="bg-growthos-surface border border-growthos-border text-growthos-text text-sm rounded-lg px-3 py-1.5">
          <option value="ALL">All Payments</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer..."
          className="bg-growthos-surface border border-growthos-border text-growthos-text text-sm rounded-lg px-3 py-1.5 w-48"
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-growthos-surface border border-growthos-border text-growthos-text text-sm rounded-lg px-3 py-1.5">
          <option value="date">Sort: Date</option>
          <option value="amount">Sort: Amount</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="text-growthos-muted">Loading orders...</div></div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : paginated.length === 0 ? (
        <div className="text-growthos-muted text-sm">No orders found.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-growthos-border text-growthos-muted">
                  <th className="text-left py-3 px-4">Order</th>
                  <th className="text-left py-3 px-4">Customer</th>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Items</th>
                  <th className="text-right py-3 px-4">Total</th>
                  <th className="text-left py-3 px-4">Payment</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((o: any) => (
                  <tr key={o.id} className="border-b border-growthos-border/50 hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-growthos-text font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="py-3 px-4 text-growthos-text">{o.customer?.name}</td>
                    <td className="py-3 px-4 text-growthos-muted">{new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 px-4 text-growthos-muted">{o.items?.length ?? 0}</td>
                    <td className="py-3 px-4 text-right text-growthos-text">{formatINR(o.totalMinor)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        o.payments?.[0]?.status === "CAPTURED" ? "bg-green-500/10 text-green-400" :
                        o.payments?.[0]?.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                        "bg-gray-500/10 text-gray-400"
                      }`}>
                        {o.payments?.[0]?.status || "None"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        o.status === "COMPLETED" || o.status === "DELIVERED" ? "bg-green-500/10 text-green-400" :
                        o.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400" :
                        o.status === "CANCELLED" ? "bg-red-500/10 text-red-400" :
                        "bg-blue-500/10 text-blue-400"
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/merchant/orders/${o.id}`} className="text-growthos-accent text-sm hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-2">
            <div className="text-growthos-muted text-sm">
              Page {page} of {pageCount}
            </div>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 bg-growthos-surface border border-growthos-border rounded-lg text-sm text-growthos-text disabled:opacity-50">Prev</button>
              <button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-3 py-1.5 bg-growthos-surface border border-growthos-border rounded-lg text-sm text-growthos-text disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}

      {/* Create Order Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-growthos-surface border border-growthos-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-growthos-text mb-4">Create New Order</h2>

            {createError && <div className="mb-3 p-2 bg-red-500/10 text-red-400 rounded">{createError}</div>}

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="block text-sm text-growthos-muted mb-1">Customer</label>
                <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="w-full bg-growthos-surface border border-growthos-border text-growthos-text rounded-lg px-3 py-2 text-sm">
                  <option value="">Select a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-growthos-muted mb-1">Products</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="flex-1 text-growthos-text text-sm">{p.name}</div>
                      <div className="text-growthos-muted text-xs">₹{(p.priceMinor / 100).toFixed(2)} ({p.stock} in stock)</div>
                      <input
                        type="number"
                        min={1}
                        max={p.stock}
                        placeholder="Qty"
                        className="w-16 bg-growthos-surface border border-growthos-border text-growthos-text rounded-lg px-2 py-1 text-sm"
                        onChange={(e) => {
                          const qty = parseInt(e.target.value || "0", 10);
                          if (qty > 0) {
                            setCart((prev) => {
                              const exists = prev.find((ci) => ci.product.id === p.id);
                              if (exists) {
                                return prev.map((ci) => ci.product.id === p.id ? { ...ci, quantity: qty } : ci);
                              } else {
                                return [...prev, { product: p, quantity: qty }];
                              }
                            });
                          } else {
                            setCart((prev) => prev.filter((ci) => ci.product.id !== p.id));
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setCart((prev) => prev.filter((ci) => ci.product.id !== p.id))}
                        className="text-xs text-red-400 px-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {cart.length > 0 && (
                <div className="p-3 bg-growthos-surface border border-growthos-border rounded-lg">
                  <h3 className="text-growthos-text font-medium mb-2">Selected Items</h3>
                  {cart.map((ci) => (
                    <div key={ci.product.id} className="flex items-center justify-between text-sm text-growthos-muted">
                      <span>{ci.product.name} x{ci.quantity}</span>
                      <span className="text-growthos-text">₹{(ci.product.priceMinor * ci.quantity / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm text-growthos-muted mb-1">Discount (paise)</label>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(parseInt(e.target.value || "0", 10))}
                  className="w-full bg-growthos-surface border border-growthos-border text-growthos-text rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-growthos-muted mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-growthos-surface border border-growthos-border text-growthos-text rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="flex justify-between text-growthos-text font-medium">
                <span>Subtotal</span>
                <span>{formatINR(cart.reduce((s, c) => s + c.product.priceMinor * c.quantity, 0))}</span>
              </div>
              <div className="flex justify-between text-growthos-text font-medium">
                <span>Discount</span>
                <span>{formatINR(discount)}</span>
              </div>
              <div className="flex justify-between text-growthos-text font-bold text-lg">
                <span>Total</span>
                <span>{formatINR(cart.reduce((s, c) => s + c.product.priceMinor * c.quantity, 0) - discount)}</span>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 bg-growthos-surface border border-growthos-border rounded-lg text-sm text-growthos-text">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-growthos-accent text-white rounded-lg text-sm font-medium hover:bg-growthos-accent/80">Create Order</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
