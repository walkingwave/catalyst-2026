"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { normalizeUid } from "@/lib/uid";
import type { Activity, Concert, ScanResult } from "@/lib/types";

const PIN_KEY = "cc_staff_pin";
const RESULT_MS = 2500;
const DEBOUNCE_MS = 3000;

export function StaffStation() {
  // Rendered client-only (see StaffLoader), so localStorage/window are safe here.
  const [pin, setPin] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PIN_KEY);
    } catch {
      return null;
    }
  });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [concertId, setConcertId] = useState("");
  const [activityId, setActivityId] = useState("");

  const [nfcSupported] = useState<boolean>(() => "NDEFReader" in window);
  const [scanning, setScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [manualUid, setManualUid] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<ScanResult[]>([]);
  const lastRef = useRef<{ uid: string; at: number }>({ uid: "", at: 0 });
  // Latest activity for the long-lived NFC reader callback.
  const activityRef = useRef(activityId);
  useEffect(() => {
    activityRef.current = activityId;
  }, [activityId]);

  // Load catalog once we have a PIN.
  useEffect(() => {
    if (!pin) return;
    fetch("/api/staff/catalog", { headers: { "x-staff-pin": pin } })
      .then(async (r) => {
        if (r.status === 401) throw new Error("bad pin");
        return r.json();
      })
      .then((j: { concerts: Concert[]; activities: Activity[] }) => {
        setConcerts(j.concerts);
        setActivities(j.activities);
        if (j.concerts[0]) setConcertId(j.concerts[0].id);
      })
      .catch(() => {
        setPin(null);
        try {
          localStorage.removeItem(PIN_KEY);
        } catch {}
      });
  }, [pin]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    const r = await fetch("/api/staff/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    });
    if (!r.ok) return setPinError("Wrong PIN");
    try {
      localStorage.setItem(PIN_KEY, pinInput);
    } catch {}
    setPin(pinInput);
  }

  const show = useCallback((res: ScanResult) => {
    setResult(res);
    setLog((l) => [res, ...l].slice(0, 20));
    try {
      navigator.vibrate?.(res.ok ? 80 : [60, 60, 60]);
    } catch {}
    setTimeout(() => setResult((cur) => (cur === res ? null : cur)), RESULT_MS);
  }, []);

  const scan = useCallback(
    async (rawUid: string) => {
      const uid = normalizeUid(rawUid);
      const act = activityRef.current;
      if (!uid) return;
      if (!act) return show({ ok: false, status: "error", message: "Pick an activity first" });
      const now = Date.now();
      if (lastRef.current.uid === uid && now - lastRef.current.at < DEBOUNCE_MS) return;
      lastRef.current = { uid, at: now };

      try {
        const r = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json", "x-staff-pin": pin ?? "" },
          body: JSON.stringify({ band_uid: uid, activity_id: act }),
        });
        const j = (await r.json()) as ScanResult;
        show({ ...j, band_uid: j.band_uid ?? uid });
      } catch {
        show({ ok: false, status: "error", message: "Network error", band_uid: uid });
      }
    },
    [pin, show],
  );

  async function startNfc() {
    setNfcError(null);
    if (!window.NDEFReader) return setNfcError("Web NFC needs Android Chrome.");
    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const reader = new window.NDEFReader();
      reader.onreading = (ev) => {
        if (ev.serialNumber) void scan(ev.serialNumber);
      };
      reader.onreadingerror = () => {
        show({ ok: false, status: "error", message: "Couldn't read tag. Try again." });
      };
      await reader.scan({ signal: ctrl.signal });
      setScanning(true);
    } catch (err) {
      setNfcError(err instanceof Error ? err.message : "NFC failed to start");
      setScanning(false);
    }
  }

  function stopNfc() {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  // ---------- PIN gate ----------
  if (!pin) {
    return (
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-16">
        <h1 className="text-2xl font-bold mb-1">Staff station</h1>
        <p className="text-muted mb-6">Enter the staff PIN.</p>
        <form onSubmit={submitPin} className="space-y-3">
          <Input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            autoFocus
          />
          {pinError && <p className="text-danger text-sm">{pinError}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </main>
    );
  }

  const concertActivities = activities.filter((a) => a.concert_id === concertId);
  const activity = activities.find((a) => a.id === activityId);

  // ---------- station ----------
  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pt-6 pb-10 relative">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">
          <span className="text-accent">●</span> Staff
        </h1>
        <button
          className="text-muted text-sm"
          onClick={() => {
            stopNfc();
            setPin(null);
            try {
              localStorage.removeItem(PIN_KEY);
            } catch {}
          }}
        >
          Lock
        </button>
      </div>

      <label className="block text-muted text-xs uppercase tracking-wide mb-1">Concert</label>
      <select
        className="w-full h-14 rounded-2xl bg-card border border-border px-4 mb-4"
        value={concertId}
        onChange={(e) => {
          setConcertId(e.target.value);
          setActivityId("");
        }}
      >
        {concerts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.artist} · {c.name}
          </option>
        ))}
      </select>

      <label className="block text-muted text-xs uppercase tracking-wide mb-1">Activity</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {concertActivities.map((a) => (
          <button
            key={a.id}
            onClick={() => setActivityId(a.id)}
            className={`h-16 rounded-2xl border px-3 text-left ${
              a.id === activityId ? "bg-accent text-accent-fg border-accent" : "bg-card border-border"
            }`}
          >
            <p className="font-semibold leading-tight">{a.name}</p>
            <p className={`text-xs ${a.id === activityId ? "text-accent-fg/70" : "text-muted"}`}>
              +{a.points} pts
            </p>
          </button>
        ))}
      </div>

      {!nfcSupported && (
        <p className="text-muted text-sm mb-3">
          No Web NFC here. Use Android Chrome for tap scanning, or enter a UID below.
        </p>
      )}
      {nfcSupported && (
        <div className="mb-3">
          {scanning ? (
            <Button variant="secondary" onClick={stopNfc}>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              Scanning · tap bands
            </Button>
          ) : (
            <Button onClick={startNfc} disabled={!activityId}>
              Start NFC scanning
            </Button>
          )}
          {nfcError && <p className="text-danger text-sm mt-2">{nfcError}</p>}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void scan(manualUid);
          setManualUid("");
        }}
      >
        <Input
          placeholder="Band UID (manual)"
          value={manualUid}
          onChange={(e) => setManualUid(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button
          type="submit"
          disabled={!activityId || !manualUid}
          className="h-14 px-5 rounded-2xl bg-card border border-border font-semibold disabled:opacity-50"
        >
          Log
        </button>
      </form>

      {log.length > 0 && (
        <Card className="mt-6 p-0 divide-y divide-border">
          {log.map((r, i) => (
            <div key={i} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="font-mono text-muted">{r.band_uid}</span>
              <span className={r.ok ? "text-accent" : r.status === "duplicate" ? "text-amber-400" : "text-danger"}>
                {r.ok ? `+${r.points}` : r.message}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* Big confirmation overlay */}
      {result && (
        <div
          onClick={() => setResult(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 ${
            result.ok ? "bg-lime-400 text-black" : result.status === "duplicate" ? "bg-amber-400 text-black" : "bg-red-500 text-white"
          }`}
        >
          <p className="text-7xl font-bold tracking-tight">
            {result.ok ? `+${result.points}` : result.status === "duplicate" ? "Done" : "✕"}
          </p>
          <p className="text-2xl font-semibold mt-2">
            {result.ok ? activity?.name ?? result.activity : result.message}
          </p>
          {result.ok && (
            <p className="text-lg mt-3 opacity-80">
              {result.claimed
                ? `${result.owner_name || "Fan"}${result.rank ? ` · #${result.rank} tonight` : ""}`
                : "Unclaimed band · points saved"}
            </p>
          )}
          <p className="font-mono text-sm mt-6 opacity-60">{result.band_uid}</p>
        </div>
      )}
    </main>
  );
}
