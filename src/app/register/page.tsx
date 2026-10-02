"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"MERCHANT" | "CUSTOMER">("CUSTOMER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      if (role === "MERCHANT") router.push("/merchant/dashboard");
      else router.push("/customer/shop");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-growthos-bg">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-growthos-text">GrowthOS</h1>
          <p className="text-growthos-muted text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-growthos-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-growthos-surface border border-growthos-border rounded-lg text-growthos-text focus:outline-none focus:border-growthos-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-growthos-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-growthos-surface border border-growthos-border rounded-lg text-growthos-text focus:outline-none focus:border-growthos-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-growthos-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-growthos-surface border border-growthos-border rounded-lg text-growthos-text focus:outline-none focus:border-growthos-accent"
              required
              minLength={8}
            />
            <p className="text-xs text-growthos-muted mt-1">Min 8 characters, uppercase, lowercase, number</p>
          </div>

          <div>
            <label className="block text-sm text-growthos-muted mb-1">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("MERCHANT")}
                className={`py-3 rounded-lg border font-medium transition-colors ${
                  role === "MERCHANT"
                    ? "bg-growthos-accent/10 border-growthos-accent text-growthos-accent"
                    : "border-growthos-border text-growthos-muted hover:border-growthos-accent/50"
                }`}
              >
                Merchant
              </button>
              <button
                type="button"
                onClick={() => setRole("CUSTOMER")}
                className={`py-3 rounded-lg border font-medium transition-colors ${
                  role === "CUSTOMER"
                    ? "bg-growthos-accent/10 border-growthos-accent text-growthos-accent"
                    : "border-growthos-border text-growthos-muted hover:border-growthos-accent/50"
                }`}
              >
                Customer
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-growthos-accent hover:bg-growthos-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-growthos-muted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-growthos-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
