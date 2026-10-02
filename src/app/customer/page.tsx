import { redirect } from "next/navigation";

export default function CustomerRoot() {
  redirect("/customer/shop");
  return null;
}
