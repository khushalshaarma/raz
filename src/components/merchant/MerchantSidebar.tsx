"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/merchant/dashboard", label: "Command Center" },
  { href: "/merchant/opportunities", label: "Opportunities" },
  { href: "/merchant/strategies", label: "Strategy Workspace" },
  { href: "/merchant/simulations", label: "Simulations" },
  { href: "/merchant/decisions", label: "Decision Center" },
  { href: "/merchant/customers", label: "Customers" },
  { href: "/merchant/customers/segments", label: "Customer Intel" },
  { href: "/merchant/campaigns", label: "Campaigns" },
  { href: "/merchant/orders", label: "Orders" },
  { href: "/merchant/payments", label: "Payments" },
  { href: "/merchant/payments/health", label: "Payment Health" },
  { href: "/merchant/executions", label: "Executions" },
  { href: "/merchant/agents", label: "Agents" },
  { href: "/merchant/autopilot", label: "Autopilot" },
  { href: "/merchant/governance", label: "Governance" },
  { href: "/merchant/approvals", label: "Approval Center" },
  { href: "/merchant/timeline", label: "Timeline" },
  { href: "/merchant/audit", label: "Audit" },
  { href: "/merchant/settings", label: "Settings" },
];

export default function MerchantSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/me", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="w-64 min-h-screen bg-growthos-surface border-r border-growthos-border flex flex-col">
      <div className="p-6 border-b border-growthos-border">
        <Link href="/merchant/dashboard" className="text-lg font-bold text-growthos-text tracking-tight">
          GrowthOS
        </Link>
        <div className="text-xs text-growthos-muted mt-1">Merchant Dashboard</div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-growthos-accent/10 text-growthos-accent font-medium"
                  : "text-growthos-muted hover:text-growthos-text hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-growthos-border">
        <button
          onClick={handleLogout}
          className="w-full px-3 py-2 text-sm text-growthos-muted hover:text-red-400 transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
