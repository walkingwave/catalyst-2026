"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, List, Row, Field, LargeTitle } from "@/components/ui";
import { IconCheck, IconLock, IconNfc, IconX } from "@/components/icons";
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
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-12">
        <div className="text-accent mb-2"><IconLock size={32} /></div>
        <LargeTitle sub="Enter the staff PIN to open the scan station.">Staff</LargeTitle>
        <form onSubmit={submitPin} className="space-y-4">
          <Field label="PIN">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
            />
          </Field>
          {pinError && <p className="t-footnote text-danger px-1">{pinError}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </main>
    );
  }

  const concertActivities = activities.filter((a) => a.concert_id === concertId);
  const activity = activities.find((a) => a.id === activityId);

  // ---------- station ----------
  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 pb-10 relative">
      <div className="flex items-center justify-between h-12 mb-2">
        <h1 className="t-title2">Scan station</h1>
        <button
          className="t-subhead text-accent h-11 px-2"
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

      <label className="t-footnote text-text-2 block mb-1.5 px-1">Concert</label>
      <select
        className="w-full h-[50px] rounded-[12px] bg-surface border border-separator px-4 t-body mb-4"
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

      <label className="t-footnote text-text-2 block mb-1.5 px-1">Activity</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {concertActivities.map((a) => {
          const on = a.id === activityId;
          return (
            <button
              key={a.id}
              onClick={() => setActivityId(a.id)}
              className={`min-h-[60px] rounded-[12px] px-3 py-2 text-left border transition-colors ${
                on ? "bg-accent text-on-accent border-accent" : "bg-surface border-separator"
              }`}
            >
              <p className="t-headline leading-tight">{a.name}</p>
              <p className={`t-footnote ${on ? "text-on-accent/80" : "text-text-2"}`}>+{a.points} pts</p>
            </button>
          );
        })}
      </div>

      {!nfcSupported && (
        <p className="t-footnote text-text-2 mb-3 px-1">
          No Web NFC in this browser. Use Android Chrome for tap scanning, or enter a UID below.
        </p>
      )}
      {nfcSupported && (
        <div className="mb-3">
          {scanning ? (
            <Button variant="tinted" onClick={stopNfc}>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              Scanning, tap bands
            </Button>
          ) : (
            <Button onClick={startNfc} disabled={!activityId}>
              <IconNfc size={20} /> Start NFC scanning
            </Button>
          )}
          {nfcError && <p className="t-footnote text-danger mt-2 px-1">{nfcError}</p>}
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
          className="h-[50px] px-5 rounded-[12px] bg-accent-soft text-accent t-headline disabled:opacity-40"
        >
          Log
        </button>
      </form>

      {log.length > 0 && (
        <List className="mt-6">
          {log.map((r, i) => (
            <Row
              key={i}
              title={<span className="font-mono t-subhead">{r.band_uid}</span>}
              subtitle={r.ok ? r.owner_name ?? "Unclaimed band" : r.message}
              value={r.ok ? `+${r.points}` : r.status === "duplicate" ? "Done" : "Error"}
              valueTone={r.ok ? "success" : r.status === "duplicate" ? "muted" : "default"}
            />
          ))}
        </List>
      )}

      {/* Big confirmation overlay */}
      {result && (
        <div
          onClick={() => setResult(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 text-white ${
            result.ok ? "bg-success" : result.status === "duplicate" ? "bg-warning" : "bg-danger"
          }`}
        >
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4">
            {result.ok ? <IconCheck size={44} strokeWidth={3} /> : <IconX size={44} strokeWidth={3} />}
          </div>
          <p className="text-[64px] leading-none font-bold tracking-tight t-num">
            {result.ok ? `+${result.points}` : result.status === "duplicate" ? "Done" : "Error"}
          </p>
          <p className="t-title2 mt-3">{result.ok ? activity?.name ?? result.activity : result.message}</p>
          {result.ok && (
            <p className="t-body mt-2 opacity-90">
              {result.claimed
                ? `${result.owner_name || "Fan"}${result.rank ? ` · #${result.rank} tonight` : ""}`
                : "Unclaimed band · points saved"}
            </p>
          )}
          <p className="font-mono t-footnote mt-8 opacity-70">{result.band_uid}</p>
        </div>
      )}
    </main>
  );
}
