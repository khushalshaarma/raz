import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import MerchantSidebar from "@/components/merchant/MerchantSidebar";

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("growthos_token")?.value;

  if (!token) {
    redirect("/login");
  }

  const payload = await verifyToken(token);
  if (!payload || payload.role !== "MERCHANT") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-growthos-bg">
      <MerchantSidebar />
      <main className="flex-1 p-8 overflow-auto">
        {/*
          Demo-mode indicator.

          `demoMode` is a claim on the server-verified JWT, rendered here on the
          server. It is a display-only marker: it grants no permission, and
          nothing secret is shipped to the client — the banner only states that
          the session belongs to the seeded demo merchant.
        */}
        {payload.demoMode ? (
          <div
            role="status"
            className="mb-6 rounded-lg border border-growthos-accent/50 bg-growthos-accent/10 px-4 py-3 text-sm text-growthos-text"
          >
            <span className="font-medium">Demo mode.</span>{" "}
            <span className="text-growthos-muted">
              You are signed in as the seeded demo merchant. Data is sample data
              and any changes are not persistent.
            </span>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
