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
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5">
      <form onSubmit={submit} className="card w-full p-6">
        <h1 className="mb-6 text-2xl font-semibold">Food Deficit</h1>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-stone-600">邮箱</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-3 outline-none focus:border-emerald-600"
            type="email"
            autoComplete="email"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-stone-600">密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-3 outline-none focus:border-emerald-600"
            type="password"
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          <LogIn size={18} />
          {loading ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}
