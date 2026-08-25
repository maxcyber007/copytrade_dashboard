import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api-client/auth";
import { AppShell } from "@/components/app-shell";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
