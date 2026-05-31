"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Link as LinkIcon, Save } from "lucide-react";

type Status = {
  oura: { connected: boolean; scope: string | null; expiresAt: number | null };
  intervals: { connected: boolean; athleteId: string };
};

export default function SettingsClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState("0");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/connections/status");
    if (response.ok) {
      const data = await response.json();
      setStatus(data);
      setAthleteId(data.intervals.athleteId || "0");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setStatus(data);
          setAthleteId(data.intervals.athleteId || "0");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveIntervals(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/connections/intervals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, athleteId })
    });
    if (!response.ok) {
      setMessage("保存失败");
      return;
    }
    setApiKey("");
    setMessage("已保存");
    await load();
  }

  return (
    <div className="space-y-4">
      <section className="app-card p-4">
        <div className="mb-4 flex items-center gap-3">
          <LinkIcon size={22} />
          <div>
            <h2 className="text-lg font-semibold">Oura</h2>
            <p className="text-sm text-stone-500">{status?.oura.connected ? "已连接" : "未连接"}</p>
          </div>
        </div>
        <a href="/api/connections/oura/start" className="inline-flex min-h-11 items-center rounded-lg bg-fuchsia-600 px-4 font-semibold text-white">
          连接 Oura
        </a>
      </section>

      <form onSubmit={saveIntervals} className="app-card p-4">
        <div className="mb-4 flex items-center gap-3">
          <KeyRound size={22} />
          <div>
            <h2 className="text-lg font-semibold">Intervals.icu</h2>
            <p className="text-sm text-stone-500">{status?.intervals.connected ? `Athlete ${status.intervals.athleteId}` : "未连接"}</p>
          </div>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-stone-600">API Key</span>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3"
            type="password"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-stone-600">Athlete ID</span>
          <input
            value={athleteId}
            onChange={(event) => setAthleteId(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3"
          />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fuchsia-600 px-4 font-semibold text-white">
          <Save size={17} />
          保存
        </button>
        {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}
      </form>
    </div>
  );
}
