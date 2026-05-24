import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import DashboardClient from "@/components/dashboard-client";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <DashboardClient initialDate={todayKey()} />;
}
