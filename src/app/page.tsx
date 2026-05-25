import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import DashboardTailAdminClient from "@/components/dashboard-tailadmin-client";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <DashboardTailAdminClient initialDate={todayKey()} />;
}
