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
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
