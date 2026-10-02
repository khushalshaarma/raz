import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import CustomerSidebar from "@/components/customer/CustomerSidebar";

export default async function CustomerLayout({
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
  if (!payload || payload.role !== "CUSTOMER") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-growthos-bg">
      <CustomerSidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
