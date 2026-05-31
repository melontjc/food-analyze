import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import SettingsClient from "@/components/settings-client";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <main className="min-h-screen bg-[#f5e9ee] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[linear-gradient(180deg,#fff8f9_0%,#fdf9fb_100%)] px-4 pb-6 pt-[calc(1rem+env(safe-area-inset-top))] shadow-[0_0_70px_rgba(131,77,104,0.20)]">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-fuchsia-600">Settings</p>
            <h1 className="mt-1 text-2xl font-bold">数据源设置</h1>
          </div>
          <Link href="/#more" className="flex min-h-11 items-center rounded-lg border border-fuchsia-100 bg-white px-3 text-sm font-bold text-fuchsia-700 shadow-sm">
            返回
          </Link>
        </header>
        <SettingsClient />
      </div>
    </main>
  );
}
