import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import SettingsClient from "@/components/settings-client";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">连接</p>
          <h1 className="text-2xl font-semibold tracking-normal">数据源设置</h1>
        </div>
        <Link href="/" className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium">
          返回看板
        </Link>
      </header>
      <SettingsClient />
    </main>
  );
}
