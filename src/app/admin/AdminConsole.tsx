"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Field, Headline, List, Row, Panel, SectionHeader, Empty, Badge } from "@/components/ui";
import { IconCheck, IconChevron, IconLock, IconNfc, IconX } from "@/components/icons";
import { normalizeUid } from "@/lib/uid";
import { nfcSupported as nfcOk, nfcErrorMessage, startNfc, writeUrl, type NfcSession } from "@/lib/nfc";
import type { Activity, Concert, ScanResult } from "@/lib/types";

const PIN_KEY = "cc_staff_pin"; // shared with /staff
const EVENT_KEY = "cc_admin_event";
const RESULT_MS = 2200;

type EventRow = Concert & { activities: Activity[]; bands: { total: number; claimed: number } };
type ArtistRow = { id: string; slug: string; name: string; kind: "artist" | "team" };
type Tab = "events" | "tap" | "write" | "bands" | "phones";

export function AdminConsole() {
  const [pin, setPin] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PIN_KEY);
    } catch {
      return null;
    }
  });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [eventId, setEventId] = useState<string>(() => {
    try {
      return localStorage.getItem(EVENT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [tab, setTab] = useState<Tab>("tap");
  const [toast, setToast] = useState<string | null>(null);
  const nfcSupported = nfcOk();

  const headers = useCallback(() => ({ "x-staff-pin": pin ?? "", "content-type": "application/json" }), [pin]);

  const load = useCallback(async () => {
    if (!pin) return;
    const r = await fetch("/api/admin/events", { headers: headers() });
    if (r.status === 401) {
      setPin(null);
      try {
        localStorage.removeItem(PIN_KEY);
      } catch {}
      return;
    }
    const j = (await r.json()) as { events: EventRow[]; artists: ArtistRow[] };
    setEvents(j.events);
    setArtists(j.artists);
    setEventId((cur) => (cur && j.events.some((e) => e.id === cur) ? cur : j.events[0]?.id ?? ""));
  }, [pin, headers]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    try {
      if (eventId) localStorage.setItem(EVENT_KEY, eventId);
    } catch {}
  }, [eventId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    const r = await fetch("/api/staff/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: pinInput }) });
    if (!r.ok) return setPinError("Wrong PIN");
    try {
      localStorage.setItem(PIN_KEY, pinInput);
    } catch {}
    setPin(pinInput);
  }

  if (!pin) {
    return (
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-12">
        <div className="mb-2"><IconLock size={32} /></div>
        <Headline>Admin</Headline>
        <form onSubmit={submitPin} className="space-y-4">
          <Field label="PIN">
            <Input type="password" inputMode="numeric" placeholder="••••" value={pinInput} onChange={(e) => setPinInput(e.target.value)} autoFocus />
          </Field>
          {pinError && <p className="t-foot text-danger">{pinError}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </main>
    );
  }

  const event = events.find((e) => e.id === eventId) ?? null;
  const tabs: { id: Tab; label: string }[] = [
    { id: "tap", label: "Tap" },
    { id: "write", label: "Write" },
    { id: "bands", label: "Bands" },
    { id: "events", label: "Events" },
    { id: "phones", label: "Phones" },
  ];

  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 pb-10">
      <div className="flex items-center justify-between h-14">
        <h1 className="display d-lg">Admin</h1>
        <button
          className="label underline underline-offset-4 h-11 px-2"
          onClick={() => {
            setPin(null);
            try {
              localStorage.removeItem(PIN_KEY);
            } catch {}
          }}
        >
          Lock
        </button>
      </div>

      {/* Event switcher: always visible so taps can jump between events fast. */}
      <label className="label text-ink-2 block mt-4 mb-2">Current event</label>
      <select
        className="w-full h-14 bg-surface-2 px-4 t-body"
        value={eventId}
        onChange={(e) => setEventId(e.target.value)}
      >
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.artist} · {e.venue} · {e.date}
          </option>
        ))}
      </select>
      {event && (
        <p className="t-foot text-ink-2 mt-2">
          {event.activities.length} {event.activities.length === 1 ? "activity" : "activities"} · {event.bands.total} {event.bands.total === 1 ? "band" : "bands"} ({event.bands.claimed} claimed)
        </p>
      )}

      <div className="flex gap-1 mt-4 bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 h-10 label ${tab === t.id ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tap" && event && <TapTab key={event.id} event={event} headers={headers} nfcSupported={nfcSupported} onChanged={load} />}
      {tab === "write" && event && <WriteTab event={event} headers={headers} nfcSupported={nfcSupported} onDone={load} />}
      {tab === "bands" && event && <BandsTab event={event} events={events} headers={headers} flash={flash} onChanged={load} />}
      {tab === "events" && (
        <EventsTab
          events={events}
          artists={artists}
          headers={headers}
          onCreated={async (id) => {
            await load();
            setEventId(id);
            setTab("write");
            flash("Event created. Now write bands.");
          }}
          onPick={(id) => {
            setEventId(id);
            setTab("tap");
          }}
        />
      )}
      {tab === "phones" && <PhonesTab headers={headers} flash={flash} />}
      {!event && tab !== "events" && tab !== "phones" && <Panel className="mt-4"><Empty>No events yet.</Empty></Panel>}

      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 bg-invert-bg text-invert-fg px-4 py-3 label z-50 pointer-events-none">{toast}</div>}
    </main>
  );
}

/* ---------------- Band info (used by Read mode + Write tab test) ---------------- */

type BandInfo = {
  uid: string;
  found: boolean;
  owner: string | null;
  event: string | null;
  points: number;
  scans: { name: string; points: number; at: string }[];
  archived: boolean;
};

async function fetchBandInfo(uid: string, headers: () => HeadersInit): Promise<BandInfo> {
  const r = await fetch(`/api/admin/bands?uid=${encodeURIComponent(uid)}`, { headers: headers() });
  const j = (await r.json()) as {
    uid: string;
    band: null | {
      archived: boolean;
      owner: { name: string } | null;
      concert: { name: string; artist: string } | null;
      scans: { scanned_at: string; activity: { name: string; points: number } | null }[];
    };
  };
  if (!j.band) return { uid: j.uid, found: false, owner: null, event: null, points: 0, scans: [], archived: false };
  const scans = j.band.scans.map((s) => ({ name: s.activity?.name ?? "?", points: s.activity?.points ?? 0, at: s.scanned_at }));
  return {
    uid: j.uid,
    found: true,
    owner: j.band.owner?.name ?? null,
    event: j.band.concert ? `${j.band.concert.artist} · ${j.band.concert.name}` : null,
    points: scans.reduce((n, s) => n + s.points, 0),
    scans,
    archived: j.band.archived,
  };
}

function BandInfoCard({ info, invert = false }: { info: BandInfo; invert?: boolean }) {
  const muted = invert ? "opacity-70" : "text-ink-2";
  return (
    <div className={`text-left w-full ${invert ? "bg-invert-fg/10" : "bg-surface-2"} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono t-sub">{info.uid}</p>
          <p className={`t-foot mt-1 ${muted}`}>
            {!info.found ? "Not registered" : `${info.owner ?? "Unclaimed"} · ${info.event ?? "No event"}${info.archived ? " · archived" : ""}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="display d-lg t-num">{info.points}</p>
          <p className={`t-foot ${muted}`}>pts</p>
        </div>
      </div>
      {info.scans.length > 0 && (
        <ul className={`mt-3 space-y-1 border-t ${invert ? "border-invert-fg/20" : "border-line-soft"} pt-3`}>
          {info.scans.map((s, i) => (
            <li key={i} className="flex justify-between t-sub">
              <span>{s.name}</span>
              <span className="t-num">+{s.points}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Tap: simulate scans at the current event ---------------- */

function TapTab({ event, headers, nfcSupported, onChanged }: { event: EventRow; headers: () => HeadersInit; nfcSupported: boolean; onChanged: () => void }) {
  const scanActs = event.activities.filter((a) => a.kind !== "social");
  const [activityId, setActivityId] = useState(scanActs[0]?.id ?? "");
  const [liveBusy, setLiveBusy] = useState(false);
  const liveActivity = scanActs.find((a) => a.id === event.live_activity_id) ?? null;
  const isLive = !!activityId && event.live_activity_id === activityId;

  const activity = scanActs.find((a) => a.id === activityId);

  async function setLive(id: string | null) {
    setLiveBusy(true);
    await fetch("/api/admin/events", { method: "PATCH", headers: headers(), body: JSON.stringify({ id: event.id, live_activity_id: id }) });
    setLiveBusy(false);
    onChanged();
  }
  const [manualUid, setManualUid] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [station, setStation] = useState(false); // full-screen station mode
  const [mode, setMode] = useState<"scan" | "reset" | "read">("scan");
  const [readInfo, setReadInfo] = useState<BandInfo | null>(null);
  const modeRef = useRef(mode);
  const stationRef = useRef(false);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const sessionRef = useRef<NfcSession | null>(null);
  const activityRef = useRef(activityId);
  const lastRef = useRef({ uid: "", at: 0 });
  useEffect(() => {
    activityRef.current = activityId;
  }, [activityId]);
  useEffect(() => () => sessionRef.current?.stop(), []);

  function show(res: ScanResult) {
    setResult(res);
    setLog((l) => [res, ...l].slice(0, 15));
    try {
      navigator.vibrate?.(res.ok ? 80 : [60, 60, 60]);
    } catch {}
    setTimeout(() => setResult((cur) => (cur === res ? null : cur)), RESULT_MS);
  }

  async function scan(raw: string, opts: { manual?: boolean; reader?: NDEFReader; records?: { recordType: string; data: string | null }[] } = {}) {
      const uid = normalizeUid(raw);
      const act = activityRef.current;
      if (!uid) return;
      const now = Date.now();
      // NFC fires repeatedly while a tag sits on the phone; manual entry is always intentional.
      if (!opts.manual && lastRef.current.uid === uid && now - lastRef.current.at < 2500) return;
      lastRef.current = { uid, at: now };
      if (modeRef.current === "read") {
        try {
          setReadInfo(await fetchBandInfo(uid, headers));
          try {
            navigator.vibrate?.(40);
          } catch {}
        } catch {
          show({ ok: false, status: "error", message: "Network error", band_uid: uid });
        }
        return;
      }
      if (modeRef.current === "reset") {
        try {
          const r = await fetch("/api/admin/bands", { method: "PATCH", headers: headers(), body: JSON.stringify({ uid, action: "reset" }) });
          const j = (await r.json()) as { ok: boolean; message?: string };
          show(j.ok ? { ok: true, status: "reset", message: "Band reset", band_uid: uid } : { ok: false, status: "error", message: j.message ?? "Reset failed", band_uid: uid });
          if (j.ok) onChanged();
        } catch {
          show({ ok: false, status: "error", message: "Network error", band_uid: uid });
        }
        return;
      }
      if (!act) return;
      try {
        const r = await fetch("/api/scan", { method: "POST", headers: headers(), body: JSON.stringify({ band_uid: uid, activity_id: act }) });
        const j = (await r.json()) as ScanResult;
        const res: ScanResult = { ...j, band_uid: j.band_uid ?? uid };
        // Write-on-tap: if the physical tag doesn't carry its band URL yet, write it now while it's in the field.
        if (opts.reader && (j.ok || j.status === "duplicate")) {
          const url = `${window.location.origin}/b/${res.band_uid}`;
          // Only count the tag as set if it carries THIS site's URL for this band; a stale host gets rewritten.
          const hasUrl = (opts.records ?? []).some((r) => r.recordType === "url" && r.data && r.data.replace(/^\x00+/, "").trim() === url);
          if (hasUrl) res.wrote = "already";
          else {
            try {
              await writeUrl(opts.reader, url);
              res.wrote = "written";
            } catch {
              res.wrote = "failed";
            }
          }
        }
        show(res);
        if (j.ok) onChanged(); // refresh band counts in the header
      } catch {
        show({ ok: false, status: "error", message: "Network error", band_uid: uid });
      }
  }

  async function startScanning() {
    setNfcError(null);
    setStation(true); // the station screen opens even without NFC (manual entry still works)
    stationRef.current = true;
    if (!nfcSupported) return;
    try {
      sessionRef.current = await startNfc({
        onTag: (serial, reader, records) => void scan(serial, { reader, records }),
        onError: (message) => show({ ok: false, status: "error", message }),
      });
      setScanning(true);
    } catch (err) {
      setNfcError(nfcErrorMessage(err));
    }
  }
  function stopNfc() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setScanning(false);
  }
  function exitStation() {
    stationRef.current = false;
    stopNfc();
    setStation(false);
    setMode("scan");
  }
  // Keep a scan session alive while the station is open. Without one, Android itself opens the
  // band's URL on tap (which is why a tap used to land on the sign-in page).
  useEffect(() => {
    if (!station || !nfcSupported) return;
    const restart = () => {
      if (stationRef.current && document.visibilityState === "visible" && !sessionRef.current) void startScanning();
    };
    document.addEventListener("visibilitychange", restart);
    const stopped = () => {
      sessionRef.current = null;
      setScanning(false);
      setTimeout(restart, 300);
    };
    window.addEventListener("cc:nfc-stopped", stopped);
    return () => {
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("cc:nfc-stopped", stopped);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, nfcSupported]);

  return (
    <>
      <SectionHeader>Simulate a tap</SectionHeader>
      <p className="label text-ink-2 mb-2">Activity at {event.venue}</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {scanActs.map((a) => {
          const on = a.id === activityId;
          return (
            <button
              key={a.id}
              onClick={() => setActivityId(a.id)}
              className={`min-h-[60px] px-3 py-2 text-left ${on ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}
            >
              <p className="display d-sm">{a.name}</p>
              <p className={`t-foot mt-1 ${on ? "text-invert-fg/70" : "text-ink-2"}`}>+{a.points} pts</p>
            </button>
          );
        })}
      </div>

      {/* iPhone-friendly: make the selected activity the live station. Any tap of a band URL logs it. */}
      <Panel invert={isLive} className="p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`label ${isLive ? "text-invert-fg/70" : "text-ink-2"}`}>Live station</p>
            <p className="display d-md mt-1">{liveActivity ? liveActivity.name : "Off"}</p>
            {liveActivity && <p className={`t-foot mt-1 ${isLive ? "text-invert-fg/70" : "text-ink-2"}`}>Any phone tapping a band logs this activity.</p>}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {!isLive && activityId && (
            <button onClick={() => setLive(activityId)} disabled={liveBusy} className={`flex-1 h-11 label ${isLive ? "bg-invert-fg text-invert-bg" : "bg-invert-bg text-invert-fg"}`}>
              {liveBusy ? "…" : `Go live: ${activity?.name ?? ""}`}
            </button>
          )}
          {liveActivity && (
            <button onClick={() => setLive(null)} disabled={liveBusy} className={`flex-1 h-11 label border-2 ${isLive ? "border-invert-fg" : "border-line"}`}>
              Turn off
            </button>
          )}
        </div>
      </Panel>

      <div className="mb-3">
        <Button onClick={startScanning} disabled={!activityId}>
          <IconNfc size={20} /> Open station
        </Button>
        {!nfcSupported && <p className="t-foot text-ink-2 mt-2">No NFC in this browser. Enter a UID instead.</p>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void scan(manualUid, { manual: true });
          setManualUid("");
        }}
      >
        <Input placeholder="Band UID" value={manualUid} onChange={(e) => setManualUid(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
        <button type="submit" disabled={!activityId || !manualUid} className="h-14 px-5 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40 press">
          Tap
        </button>
      </form>

      {log.length > 0 && (
        <List className="mt-6">
          {log.map((r, i) => (
            <Row
              key={i}
              title={<span className="font-mono t-sub">{r.band_uid}</span>}
              subtitle={r.status === "reset" ? "Reset" : r.ok ? `${r.activity} · ${r.owner_name ?? "unclaimed"}` : r.message}
              value={r.status === "reset" ? "Reset" : r.ok ? `+${r.points}` : r.status === "duplicate" ? "Done" : "Error"}
              valueTone={r.ok ? "success" : "muted"}
            />
          ))}
        </List>
      )}

      {station && (
        <StationScreen
          event={event}
          activity={activity ?? null}
          scanning={scanning}
          nfcSupported={nfcSupported}
          nfcError={nfcError}
          isLive={isLive}
          log={log}
          mode={mode}
          onMode={(m) => {
            setMode(m);
            setReadInfo(null);
          }}
          readInfo={readInfo}
          onExit={exitStation}
          onManual={(uid) => void scan(uid, { manual: true })}
          onRetry={() => void startScanning()}
        />
      )}
      {result && <Overlay result={result} activityName={activity?.name} onClose={() => setResult(null)} />}
    </>
  );
}

/* ---------------- Station: full-screen tap mode ---------------- */

function StationScreen({
  event,
  activity,
  scanning,
  nfcSupported,
  nfcError,
  isLive,
  log,
  mode,
  onMode,
  readInfo,
  onExit,
  onManual,
  onRetry,
}: {
  event: EventRow;
  activity: Activity | null;
  scanning: boolean;
  nfcSupported: boolean;
  nfcError: string | null;
  isLive: boolean;
  log: ScanResult[];
  mode: "scan" | "reset" | "read";
  onMode: (m: "scan" | "reset" | "read") => void;
  readInfo: BandInfo | null;
  onExit: () => void;
  onManual: (uid: string) => void;
  onRetry: () => void;
}) {
  const [uid, setUid] = useState("");
  const last = log[0];
  return (
    <div className="fixed inset-0 z-40 bg-invert-bg text-invert-fg flex flex-col" data-testid="station">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onExit} className="h-11 px-2 -ml-2 label flex items-center gap-1 press" aria-label="Back to admin">
          <IconChevron size={18} className="rotate-180" /> Back
        </button>
        <div className="flex gap-1 bg-invert-fg/10 p-1">
          <button onClick={() => onMode("scan")} className={`h-8 px-3 label ${mode === "scan" ? "bg-invert-fg text-invert-bg" : "opacity-70"}`}>
            {isLive ? "Live" : "Scan"}
          </button>
          <button onClick={() => onMode("read")} className={`h-8 px-3 label ${mode === "read" ? "bg-invert-fg text-invert-bg" : "opacity-70"}`}>
            Read
          </button>
          <button onClick={() => onMode("reset")} className={`h-8 px-3 label ${mode === "reset" ? "bg-warning text-black" : "opacity-70"}`}>
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <p className="mono-caps text-[11px] opacity-70">{event.artist} · {event.venue}</p>
        {mode === "reset" ? (
          <>
            <p className="display d-hero mt-3 text-warning">Reset</p>
            <p className="t-sub opacity-70 mt-2 max-w-xs">Tapped bands lose their scans and owner.</p>
          </>
        ) : mode === "read" ? (
          <>
            <p className="display d-hero mt-3">Read</p>
            {readInfo ? <div className="mt-6 w-full max-w-sm"><BandInfoCard info={readInfo} invert /></div> : <p className="t-sub opacity-70 mt-2">Tap a band to see its points and history.</p>}
          </>
        ) : (
          <>
            <p className="display d-hero mt-3">{activity?.name ?? "Pick an activity"}</p>
            {activity && <p className="display d-md opacity-70 mt-2">+{activity.points} pts</p>}
          </>
        )}

        <div className="mt-10 flex flex-col items-center">
          {nfcSupported ? (
            scanning ? (
              <>
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <span className="absolute inset-0 bg-invert-fg/10 animate-ping" />
                  <span className="absolute inset-3 bg-invert-fg/10" />
                  <IconNfc size={48} />
                </div>
                <p className="label mt-5">Hold band here</p>
                <p className="t-foot opacity-60 mt-2">Logs the tap and writes the band URL if the tag is blank</p>
              </>
            ) : (
              <>
                {nfcError && <p className="t-sub text-danger max-w-xs">{nfcError}</p>}
                <button onClick={onRetry} className="mt-4 h-12 px-6 bg-invert-fg text-invert-bg display d-sm press">
                  Start NFC
                </button>
              </>
            )
          ) : (
            <p className="t-sub opacity-70">No NFC here. Enter a band UID below.</p>
          )}
        </div>

        {last && (
          <p className="mt-10 mono-caps text-[11px] opacity-70">
            Last: {last.band_uid} · {last.status === "reset" ? "reset" : last.ok ? `+${last.points}` : last.status === "duplicate" ? "already done" : last.message}
          </p>
        )}
      </div>

      <form
        className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!uid) return;
          onManual(uid);
          setUid("");
        }}
      >
        <input
          className="flex-1 h-12 bg-invert-fg/10 text-invert-fg px-4 t-body outline-none placeholder:text-invert-fg/40"
          placeholder="Band UID"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button type="submit" disabled={!uid} className="h-12 px-5 bg-invert-fg text-invert-bg display d-sm disabled:opacity-40 press">
          Tap
        </button>
      </form>
    </div>
  );
}

/* ---------------- Write: phone becomes an NFC writer ---------------- */

type WriteLog = { uid: string; status: string; ok: boolean; at: number };

function WriteTab({ event, headers, nfcSupported, onDone }: { event: EventRow; headers: () => HeadersInit; nfcSupported: boolean; onDone: () => void }) {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<WriteLog[]>([]);
  const [manualUid, setManualUid] = useState("");
  const [flashUid, setFlashUid] = useState<WriteLog | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ serial: string; records: { recordType: string; data: string | null }[]; info?: BandInfo } | null>(null);
  const sessionRef = useRef<NfcSession | null>(null);
  const lastRef = useRef({ uid: "", at: 0 });
  useEffect(() => () => sessionRef.current?.stop(), []);

  async function register(raw: string) {
    const uid = normalizeUid(raw);
    if (!uid) return null;
    const r = await fetch("/api/admin/bands", { method: "POST", headers: headers(), body: JSON.stringify({ uid, concert_id: event.id }) });
    const j = (await r.json()) as { ok: boolean; status?: string; tag_url?: string; message?: string; claimed?: boolean };
    return { uid, ...j };
  }

  function push(entry: WriteLog) {
    setLog((l) => [entry, ...l].slice(0, 20));
    setFlashUid(entry);
    try {
      navigator.vibrate?.(entry.ok ? 80 : [60, 60, 60]);
    } catch {}
    setTimeout(() => setFlashUid((cur) => (cur === entry ? null : cur)), RESULT_MS);
    onDone();
  }

  async function startWriter() {
    setError(null);
    stopAll();
    try {
      sessionRef.current = await startNfc({
        onTag: async (serial, reader) => {
          const uid = normalizeUid(serial);
          const now = Date.now();
          if (!uid) return push({ uid: "?", ok: false, status: "Tag has no readable serial", at: now });
          if (lastRef.current.uid === uid && now - lastRef.current.at < 3000) return;
          lastRef.current = { uid, at: now };
          try {
            const res = await register(uid);
            if (!res?.ok || !res.tag_url) throw new Error(res?.message ?? "Register failed");
            // Write the tap URL while the tag is still in the field.
            await writeUrl(reader, res.tag_url);
            push({ uid, ok: true, status: `${res.status === "created" ? "Registered" : res.status === "moved" ? "Moved" : "Already here"} · URL written`, at: now });
          } catch (err) {
            push({ uid, ok: false, status: nfcErrorMessage(err), at: now });
          }
        },
        onError: (message) => push({ uid: "?", ok: false, status: message, at: Date.now() }),
      });
      setWriting(true);
    } catch (err) {
      setError(nfcErrorMessage(err));
    }
  }
  async function startTest() {
    setError(null);
    stopAll();
    setTestResult(null);
    try {
      sessionRef.current = await startNfc({
        onTag: async (serial, _reader, records) => {
          const uid = normalizeUid(serial);
          setTestResult({ serial: uid || serial || "(none)", records });
          if (uid) {
            try {
              setTestResult({ serial: uid, records, info: await fetchBandInfo(uid, headers) });
            } catch {}
          }
        },
        onError: (message) => setError(message),
      });
      setTesting(true);
    } catch (err) {
      setError(nfcErrorMessage(err));
    }
  }
  function stopAll() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setWriting(false);
    setTesting(false);
  }
  const stopWriter = stopAll;

  return (
    <>
      <SectionHeader>Write bands</SectionHeader>
      <div>
        {nfcSupported ? (
          <div className="space-y-2">
            {writing ? (
              <Button variant="outline" onClick={stopWriter}>
                <span className="inline-block w-2.5 h-2.5 bg-success animate-pulse" /> Writing
              </Button>
            ) : (
              <Button onClick={startWriter}>
                <IconNfc size={20} /> Write
              </Button>
            )}
            {testing ? (
              <Button variant="outline" size="md" onClick={stopAll}>
                <span className="inline-block w-2.5 h-2.5 bg-success animate-pulse" /> Reading
              </Button>
            ) : (
              <Button variant="outline" size="md" onClick={startTest}>Read tag</Button>
            )}
            {testResult && (
              <div className="space-y-2">
                {testResult.info ? (
                  <BandInfoCard info={testResult.info} />
                ) : (
                  <div className="bg-surface-2 p-3"><p className="font-mono t-sub">{testResult.serial}</p></div>
                )}
                <p className="t-foot text-ink-2 px-1">
                  {testResult.records.length === 0
                    ? "Tag: no NDEF records (blank)"
                    : "Tag: " + testResult.records.map((r) => `${r.recordType} ${r.data ?? "(binary)"}`).join(" · ")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="t-foot text-ink-2">No NFC in this browser. Register a UID instead.</p>
        )}
        {error && <p className="t-foot text-danger mt-2">{error}</p>}
      </div>

      <form
        className="flex gap-2 mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await register(manualUid);
          if (res) push({ uid: res.uid, ok: !!res.ok, status: res.ok ? `${res.status} · ${res.tag_url}` : res.message ?? "Failed", at: Date.now() });
          setManualUid("");
        }}
      >
        <Input placeholder="Band UID" value={manualUid} onChange={(e) => setManualUid(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
        <button type="submit" disabled={!manualUid} className="h-14 px-5 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40 press">
          Register
        </button>
      </form>

      {log.length > 0 && (
        <List className="mt-6">
          {log.map((l, i) => (
            <Row key={i} title={<span className="font-mono t-sub">{l.uid}</span>} subtitle={l.status} value={l.ok ? "OK" : "Error"} valueTone={l.ok ? "success" : "muted"} />
          ))}
        </List>
      )}

      {flashUid && (
        <div
          onClick={() => setFlashUid(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 text-white ${flashUid.ok ? "bg-success" : "bg-danger"}`}
        >
          <div className="w-20 h-20 border-4 border-white flex items-center justify-center mb-6">
            {flashUid.ok ? <IconCheck size={44} strokeWidth={3} /> : <IconX size={44} strokeWidth={3} />}
          </div>
          <p className="display d-hero">{flashUid.ok ? "Written" : "Failed"}</p>
          <p className="t-body mt-3 opacity-90">{flashUid.status}</p>
          <p className="font-mono t-foot mt-8 opacity-70">{flashUid.uid}</p>
        </div>
      )}
    </>
  );
}

/* ---------------- Bands: read / write band records ---------------- */

type BandRow = { uid: string; user_id: string | null; claimed_at: string | null; archived: boolean; owner: { name: string } | null; points: number; activity_count: number };
type BandDetail = {
  uid: string;
  concert_id: string;
  user_id: string | null;
  archived: boolean;
  owner: { name: string; phone: string | null } | null;
  concert: { name: string; artist: string } | null;
  scans: { id: string; scanned_at: string; activity: { name: string; points: number } | null }[];
};

function BandsTab({
  event,
  events,
  headers,
  flash,
  onChanged,
}: {
  event: EventRow;
  events: EventRow[];
  headers: () => HeadersInit;
  flash: (m: string) => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<BandRow[]>([]);
  const [lookup, setLookup] = useState("");
  const [detail, setDetail] = useState<{ uid: string; tag_url: string; band: BandDetail | null } | null>(null);
  const [moveTo, setMoveTo] = useState(event.id);

  const loadRows = useCallback(async () => {
    const r = await fetch(`/api/admin/bands?concert=${event.id}`, { headers: headers() });
    const j = await r.json();
    setRows(j.bands ?? []);
  }, [event.id, headers]);
  useEffect(() => {
    queueMicrotask(() => void loadRows());
  }, [loadRows]);

  async function open(uid: string) {
    const r = await fetch(`/api/admin/bands?uid=${encodeURIComponent(uid)}`, { headers: headers() });
    const j = await r.json();
    setDetail(j);
    setMoveTo(j.band?.concert_id ?? event.id);
  }
  async function act(action: string) {
    if (!detail) return;
    await fetch("/api/admin/bands", { method: "PATCH", headers: headers(), body: JSON.stringify({ uid: detail.uid, action }) });
    flash(`${action.replace("_", " ")} done`);
    await open(detail.uid);
    await loadRows();
    onChanged();
  }
  async function move() {
    if (!detail) return;
    await fetch("/api/admin/bands", { method: "POST", headers: headers(), body: JSON.stringify({ uid: detail.uid, concert_id: moveTo }) });
    flash("Band assigned");
    await open(detail.uid);
    await loadRows();
    onChanged();
  }

  return (
    <>
      <SectionHeader>Band</SectionHeader>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open(lookup);
        }}
      >
        <Input placeholder="Band UID" value={lookup} onChange={(e) => setLookup(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
        <button type="submit" disabled={!lookup} className="h-14 px-5 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40 press">
          Open
        </button>
      </form>

      {detail && (
        <Panel className="mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono display d-md">{detail.uid}</p>
              <p className="t-foot text-ink-2 mt-1 break-all">{detail.tag_url}</p>
            </div>
            <span data-testid="band-status">
              {detail.band ? (
                <Badge tone={detail.band.archived ? "warning" : detail.band.user_id ? "success" : "ink"}>
                  {detail.band.archived ? "archived" : detail.band.user_id ? "claimed" : "unclaimed"}
                </Badge>
              ) : (
                <Badge tone="warning">unknown</Badge>
              )}
            </span>
          </div>
          {detail.band ? (
            <>
              <List className="mt-4">
                <Row title="Event" value={<span className="t-sub normal-case font-sans">{detail.band.concert?.artist}</span>} />
                <Row title="Owner" value={<span className="t-sub normal-case font-sans">{detail.band.owner?.name ?? "—"}</span>} />
                <Row title="Scans" value={detail.band.scans.length} />
              </List>
              {detail.band.scans.length > 0 && (
                <List className="mt-3">
                  {detail.band.scans.map((s) => (
                    <Row key={s.id} title={s.activity?.name} subtitle={new Date(s.scanned_at).toLocaleString()} value={`+${s.activity?.points}`} />
                  ))}
                </List>
              )}
              <p className="label text-ink-2 mt-4 mb-2">Assign to event</p>
              <div className="flex gap-2 w-full">
                {/* min-w-0 lets the select shrink below its option text so the button never leaves the viewport */}
                <select className="flex-1 min-w-0 h-12 bg-surface-2 px-3 t-sub" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.artist} · {e.date}
                    </option>
                  ))}
                </select>
                <button onClick={move} className="h-12 px-4 shrink-0 bg-invert-bg text-invert-fg label press">Move</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {detail.band.user_id && <Button size="md" variant="outline" onClick={() => act("unclaim")}>Unclaim</Button>}
                {detail.band.archived ? (
                  <Button size="md" variant="outline" onClick={() => act("restore")}>Restore</Button>
                ) : (
                  <Button size="md" variant="outline" onClick={() => act("archive")}>Archive</Button>
                )}
                <Button size="md" variant="danger" onClick={() => act("clear_scans")}>Clear scans</Button>
                <Button size="md" variant="danger" onClick={() => act("reset")}>Reset band</Button>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <Button size="md" onClick={move}>Register to {event.artist}</Button>
            </div>
          )}
        </Panel>
      )}

      <SectionHeader action={`${rows.length} bands`}>{event.artist} bands</SectionHeader>
      {rows.length === 0 ? (
        <Panel><Empty>No bands yet.</Empty></Panel>
      ) : (
        <List>
          {rows.map((b) => (
            <Row
              key={b.uid}
              onClick={() => {
                setLookup(b.uid);
                void open(b.uid);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              title={<span className="font-mono t-sub">{b.uid}</span>}
              subtitle={`${b.owner?.name ?? "unclaimed"} · ${b.activity_count} scans${b.archived ? " · archived" : ""}`}
              value={b.points}
              chevron
            />
          ))}
        </List>
      )}
    </>
  );
}

/* ---------------- Events: list + create ---------------- */

type ActDraft = { name: string; points: string; location: string };

function EventsTab({
  events,
  artists,
  headers,
  onCreated,
  onPick,
}: {
  events: EventRow[];
  artists: ArtistRow[];
  headers: () => HeadersInit;
  onCreated: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const [openPref, setOpen] = useState<boolean | null>(null);
  const open = openPref ?? events.length === 0; // auto-open only when there are truly no events
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [doors, setDoors] = useState("");
  const [artistId, setArtistId] = useState<string>(artists[0]?.id ?? "new");
  const [newArtist, setNewArtist] = useState("");
  const [newKind, setNewKind] = useState<"artist" | "team">("artist");
  const [acts, setActs] = useState<ActDraft[]>([
    { name: "Entry", points: "50", location: "Doors" },
    { name: "Merch Booth", points: "100", location: "" },
    { name: "Photo Wall", points: "75", location: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = acts.reduce((n, a) => n + (Number(a.points) || 0), 0);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/events", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name,
        description,
        venue,
        address,
        date,
        doors_at: doors,
        artist_id: artistId === "new" ? undefined : artistId,
        new_artist: artistId === "new" ? { name: newArtist, kind: newKind } : undefined,
        activities: acts.map((a) => ({ name: a.name, points: Number(a.points) || 0, location: a.location })),
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.message ?? "Could not create event");
    setName("");
    setDescription("");
    setVenue("");
    setAddress("");
    setOpen(false);
    onCreated(j.event.id);
  }

  return (
    <>
      <SectionHeader action={<button className="underline" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "New event"}</button>}>Events</SectionHeader>

      {open && (
        <Panel className="p-4 mb-4">
          <form onSubmit={create} className="space-y-4">
            <Field label="Event name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
            </Field>
            <Field label="Description">
              <textarea className="w-full min-h-20 bg-surface-2 p-3 t-body outline-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue" required />
              </Field>
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Address (optional)">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
              </Field>
              <Field label="Doors (optional)">
                <Input value={doors} onChange={(e) => setDoors(e.target.value)} placeholder="Doors" />
              </Field>
            </div>
            <Field label="Artist or team">
              <select className="w-full h-14 bg-surface-2 px-4 t-body" value={artistId} onChange={(e) => setArtistId(e.target.value)}>
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.kind})
                  </option>
                ))}
                <option value="new">+ New artist / team</option>
              </select>
            </Field>
            {artistId === "new" && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={newArtist} onChange={(e) => setNewArtist(e.target.value)} placeholder="Name" required />
                <select className="h-14 bg-surface-2 px-3 t-sub" value={newKind} onChange={(e) => setNewKind(e.target.value as "artist" | "team")}>
                  <option value="artist">Artist</option>
                  <option value="team">Team</option>
                </select>
              </div>
            )}

            <div>
              <div className="flex items-end justify-between mb-2">
                <p className="label text-ink-2">Activities and points</p>
                <p className="label">{total} pts possible</p>
              </div>
              <div className="space-y-2">
                {acts.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_72px_auto] gap-2">
                    <Input value={a.name} onChange={(e) => setActs(acts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Activity" />
                    <Input inputMode="numeric" value={a.points} onChange={(e) => setActs(acts.map((x, j) => (j === i ? { ...x, points: e.target.value.replace(/\D/g, "") } : x)))} placeholder="pts" />
                    <button type="button" onClick={() => setActs(acts.filter((_, j) => j !== i))} className="h-14 w-12 bg-surface-2 flex items-center justify-center" aria-label="Remove">
                      <IconX size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setActs([...acts, { name: "", points: "50", location: "" }])} className="mt-2 h-11 px-3 bg-surface-2 label">
                + Add activity
              </button>
            </div>

            {error && <p className="t-foot text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create event"}</Button>
          </form>
        </Panel>
      )}

      {events.length === 0 ? (
        <Panel><Empty>No events yet.</Empty></Panel>
      ) : (
        <List>
          {events.map((e) => (
            <Row
              key={e.id}
              onClick={() => onPick(e.id)}
              title={`${e.artist} · ${e.venue}`}
              subtitle={`${e.date} · ${e.activities.length} activities · ${e.bands.total} bands`}
              value={e.activities.reduce((n, a) => n + a.points, 0)}
              chevron
            />
          ))}
        </List>
      )}
    </>
  );
}

/* ---------------- Phones: demo numbers that sign in with a fixed code (no SMS) ---------------- */

type DemoPhones = { ok: boolean; configured: boolean; message?: string; otps?: { phone: string; code: string }[]; valid_until?: string | null; phone_enabled?: boolean };

function PhonesTab({ headers, flash }: { headers: () => HeadersInit; flash: (m: string) => void }) {
  const [data, setData] = useState<DemoPhones | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/demo-phones", { headers: headers() });
    setData(await r.json());
  }, [headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/admin/demo-phones", { method: "POST", headers: headers(), body: JSON.stringify({ phone }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok || !j.ok) return flash(j.message ?? "Could not add");
    flash(`${j.phone} signs in with code ${j.code}`);
    setPhone("");
    void load();
  }
  async function remove(p: string) {
    await fetch(`/api/admin/demo-phones?phone=${encodeURIComponent(p)}`, { method: "DELETE", headers: headers() });
    void load();
  }

  return (
    <>
      <SectionHeader>Demo phones</SectionHeader>
      <p className="t-sub text-ink-2">These numbers sign in with code <span className="font-mono">123456</span>, no text sent.</p>
      {data && !data.configured && (
        <Panel className="p-4 mt-3">
          <p className="t-sub">
            Needs <span className="font-mono">SUPABASE_ACCESS_TOKEN</span> in the server env. Create one at supabase.com/dashboard/account/tokens. Until then, edit the list in Supabase → Authentication → Phone → Test OTPs.
          </p>
        </Panel>
      )}
      {data && data.configured && !data.ok && <p className="t-foot text-danger mt-3">{data.message}</p>}
      {data?.configured && data.ok && (
        <>
          <form onSubmit={add} className="flex gap-2 mt-4">
            <Input type="tel" inputMode="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button type="submit" disabled={busy || !phone} className="h-14 px-5 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40 press">
              {busy ? "…" : "Add"}
            </button>
          </form>
          <p className="t-foot text-ink-2 mt-2">
            {data.otps?.length ?? 0} numbers · valid until {data.valid_until ? new Date(data.valid_until).toLocaleDateString() : "—"}
          </p>
          <List className="mt-3">
            {(data.otps ?? []).map((t) => (
              <Row key={t.phone} title={<span className="font-mono">+{t.phone}</span>} subtitle={`code ${t.code}`} value={<button onClick={() => remove(t.phone)} className="label underline underline-offset-4 normal-case">Remove</button>} />
            ))}
          </List>
        </>
      )}
    </>
  );
}

/* ---------------- shared overlay ---------------- */

function Overlay({ result, activityName, onClose }: { result: ScanResult; activityName?: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 ${
        result.status === "reset" ? "bg-warning text-black" : result.ok ? "bg-success text-white" : result.status === "duplicate" ? "bg-warning text-black" : "bg-danger text-white"
      }`}
    >
      <div className="w-20 h-20 border-4 border-current flex items-center justify-center mb-6">
        {result.ok ? <IconCheck size={44} strokeWidth={3} /> : <IconX size={44} strokeWidth={3} />}
      </div>
      <p className="display text-[96px] leading-[0.85] t-num">
        {result.status === "reset" ? "Reset" : result.ok ? `+${result.points}` : result.status === "duplicate" ? "Done" : "Error"}
      </p>
      <p className="display d-lg mt-4">{result.status === "reset" ? "Scans cleared, unclaimed" : result.ok ? activityName ?? result.activity : result.message}</p>
      {result.wrote && (
        <p className="label mt-3 opacity-80">
          {result.wrote === "written" ? "Tag written" : result.wrote === "already" ? "Tag already set" : "Tag write failed, hold still and tap again"}
        </p>
      )}
      {result.ok && result.status !== "reset" && (
        <p className="t-body mt-3 opacity-90">
          {result.claimed ? `${result.owner_name || "Fan"}${result.rank ? ` · #${result.rank} tonight` : ""}` : "Unclaimed band · points saved"}
        </p>
      )}
      <p className="font-mono t-foot mt-10 opacity-70">{result.band_uid}</p>
    </div>
  );
}
