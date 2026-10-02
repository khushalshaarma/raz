import { redirect } from "next/navigation";

export default function MerchantRoot() {
  redirect("/merchant/dashboard");
  return null;
}
