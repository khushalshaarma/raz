import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-growthos-bg">
      <div className="text-center space-y-8 max-w-lg px-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-growthos-text">
            GrowthOS
          </h1>
          <p className="text-growthos-muted text-lg">
            Agentic commerce platform
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-growthos-accent hover:bg-growthos-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 border border-growthos-border text-growthos-text hover:bg-growthos-surface rounded-lg font-medium transition-colors"
          >
            Create Account
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm pt-8">
          <Link
            href="/merchant/dashboard"
            className="p-4 rounded-lg border border-growthos-border hover:border-growthos-accent/50 transition-colors"
          >
            <div className="font-medium text-growthos-text">Merchant</div>
            <div className="text-growthos-muted text-xs mt-1">Business dashboard</div>
          </Link>
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
      </div>
    </main>
  );
}
