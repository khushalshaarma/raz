"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/audit", label: "Audit Events" },
  { href: "/admin/health", label: "System Health" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/me", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="w-64 min-h-screen bg-growthos-surface border-r border-growthos-border flex flex-col">
      <div className="p-6 border-b border-growthos-border">
        <Link href="/admin" className="text-lg font-bold text-growthos-text tracking-tight">
          GrowthOS
        </Link>
        <div className="text-xs text-growthos-muted mt-1">Admin Panel</div>
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
