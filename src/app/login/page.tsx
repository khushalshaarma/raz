"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      const role = data.user.role;
      if (role === "MERCHANT") router.push("/merchant/dashboard");
      else if (role === "CUSTOMER") router.push("/customer/shop");
      else if (role === "ADMIN") router.push("/admin");
      else router.push("/");
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
          <p className="text-growthos-muted text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

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
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-growthos-accent hover:bg-growthos-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-growthos-muted mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-growthos-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
