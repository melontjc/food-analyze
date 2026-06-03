"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "登录失败");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="wellness-shell flex min-h-screen items-center justify-center px-5 py-8 text-slate-900">
      <form onSubmit={submit} className="app-card w-full max-w-sm p-6">
        <p className="text-xs font-semibold text-fuchsia-600">TRACKER</p>
        <h1 className="mb-6 mt-1 text-2xl font-bold text-slate-950">登录 Food Deficit</h1>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-600">邮箱</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
            type="email"
            autoComplete="email"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-600">密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
            type="password"
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 font-semibold text-white transition hover:bg-fuchsia-700 disabled:opacity-60"
        >
          <LogIn size={18} />
          {loading ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}
