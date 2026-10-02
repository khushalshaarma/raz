import Link from "next/link";
import { RoleEntry } from "@/components/RoleEntry";

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

        <RoleEntry />
      </div>
    </main>
  );
}
