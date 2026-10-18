"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, Field, Input, Panel, SectionHeader } from "@/components/ui";
import type { EventNotification } from "@/lib/event-notifications";

type Overview = {
  event: { id: string; name: string };
  notifications: EventNotification[];
  audience: { fans: number; phones: number };
  sms_enabled: boolean;
  scheduler_active: boolean;
};

/** Shared event alert composer for admin and staff; the parent owns the PIN. */
export function EventNotifications({ eventId, headers }: { eventId: string; headers: () => HeadersInit }) {
  const [data, setData] = useState<Overview | null>(null);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"inbox" | "sms">("inbox");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/notifications?concert_id=${eventId}`, { headers: headers(), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not load alerts.");
      setData(result);
      setCheckedAt(Date.now());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load alerts.");
    }
  }, [eventId, headers]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    let scheduled_at: string | null = null;
    if (when === "later") {
      const chosen = new Date(date);
      if (!date || !Number.isFinite(chosen.getTime()) || chosen.getTime() <= Date.now()) {
        setError("Choose a future date and time.");
        return;
      }
      scheduled_at = chosen.toISOString();
    }
    const payload = { concert_id: eventId, body: body.trim(), channel, scheduled_at };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.payload !== fingerprint) request.current = { payload: fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST", headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ ...payload, id: request.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not save alert.");
      setNotice(scheduled_at ? `Scheduled for ${new Date(scheduled_at).toLocaleString()}.` : "Alert queued to send now. Follow progress below.");
      setBody("");
      setDate("");
      request.current = null;
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not confirm the result. Check history before sending another message.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setCancelling(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/notifications?concert_id=${eventId}&id=${id}`, { method: "DELETE", headers: headers() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not cancel alert.");
      setNotice("Alert cancelled.");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not cancel alert.");
    } finally {
      setCancelling(null);
    }
  }

  return (
    <section data-testid="event-alerts">
      <SectionHeader>Alerts</SectionHeader>
      {error && <p role="alert" className="t-foot text-danger mb-3">{error}</p>}
      {!data ? <p className="t-sub text-ink-2">{error ? "Alerts unavailable." : "Loading alerts…"}</p> : (
        <>
          <Panel className="p-4">
            <p className="label text-ink-2">To everyone at</p>
            <p className="display d-md mt-1">{data.event.name}</p>
            <p className="t-foot text-ink-2 mt-2">{data.audience.fans} fans · {data.audience.phones} with phone numbers</p>
            <p className="t-foot text-ink-2 mt-1">Fans with an active claimed band. One copy per fan.</p>
          </Panel>
          <form onSubmit={submit} className="mt-4">
            <Panel className="p-4 space-y-4">
              <fieldset disabled={busy} className="space-y-4 min-w-0">
                <div>
                  <p className="label text-ink-2 mb-2">Channel</p>
                  <div className="flex gap-1 bg-surface p-1">
                    {(["inbox", "sms"] as const).map((value) => (
                      <button key={value} type="button" aria-pressed={channel === value} disabled={value === "sms" && !data.sms_enabled}
                        onClick={() => setChannel(value)}
                        className={`flex-1 h-10 label disabled:opacity-40 ${channel === value ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
                        {value === "sms" ? "SMS" : "Inbox"}
                      </button>
                    ))}
                  </div>
                  {!data.sms_enabled && <p className="t-foot text-ink-2 mt-2">SMS is unavailable. Inbox messages are available.</p>}
                </div>
                <Field label={`Message (${body.length}/320)`}>
                  <textarea className="w-full min-h-28 bg-surface p-3 t-body outline-none" placeholder="Event announcement" maxLength={320}
                    value={body} onChange={(e) => setBody(e.target.value)} required />
                </Field>
                <div>
                  <p className="label text-ink-2 mb-2">When</p>
                  <div className="flex gap-1 bg-surface p-1">
                    {(["now", "later"] as const).map((value) => (
                      <button key={value} type="button" aria-pressed={when === value} onClick={() => setWhen(value)}
                        className={`flex-1 h-10 label ${when === value ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
                        {value === "now" ? "Now" : "Schedule"}
                      </button>
                    ))}
                  </div>
                </div>
                {when === "later" && (
                  <>
                    <Field label="Send date and time">
                      <Input type="datetime-local" className="w-full min-w-0 h-14 bg-surface px-3 t-body" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </Field>
                    <p className="t-foot text-ink-2">Times in {timezone}. Includes fans who claim before sending starts.</p>
                  </>
                )}
                {!data.scheduler_active && <p className="t-foot text-ink-2">Scheduled sending is offline. Scheduled alerts will wait until it reconnects.</p>}
                {when === "now" && data.audience.fans === 0 && <p className="t-foot text-ink-2">No claimed bands yet. You can schedule an alert for later.</p>}
                <Button type="submit" disabled={!body.trim() || (when === "now" && data.audience.fans === 0) || (channel === "sms" && !data.sms_enabled)}>
                  {busy ? "Saving…" : when === "later" ? "Schedule alert" : `Send to ${data.audience.fans} fan${data.audience.fans === 1 ? "" : "s"} now`}
                </Button>
              </fieldset>
            </Panel>
          </form>
          {notice && <p role="status" className="t-foot mt-4">{notice}</p>}
          <SectionHeader action={<button type="button" className="h-10 px-2" onClick={() => { setError(null); void load(); }}>Refresh</button>}>Scheduled & sent</SectionHeader>
          {data.notifications.length === 0 ? <Empty>No event alerts yet.</Empty> : (
            <div className="space-y-3">
              {data.notifications.map((notification) => {
                const issues = notification.failed + notification.skipped + notification.unknown;
                const overdue = notification.status === "scheduled" && Date.parse(notification.scheduled_at ?? notification.created_at) < checkedAt - 120000;
                const label = notification.status === "scheduled" ? overdue ? "Waiting" : notification.scheduled_at ? "Scheduled" : "Queued"
                  : notification.status === "processing" ? "Sending" : notification.status === "completed" ? issues ? "Completed with issues" : "Completed" : "Cancelled";
                return (
                  <Panel key={notification.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={issues || overdue ? "warning" : notification.status === "completed" ? "success" : "ink"}>{label}</Badge>
                      <span className="label text-ink-2">{notification.channel === "sms" ? "SMS" : "Inbox"}</span>
                    </div>
                    <p className="t-body whitespace-pre-wrap break-words">{notification.body}</p>
                    <p className="t-foot text-ink-2">{new Date(notification.scheduled_at ?? notification.created_at).toLocaleString()}</p>
                    {notification.status !== "scheduled" && notification.status !== "cancelled" && (
                      <p className="t-foot text-ink-2">
                        {notification.channel === "sms" ? `${notification.sms_sent} SMS accepted` : `${notification.inbox_count} inbox copies`}
                        {notification.remaining > 0 ? ` · ${notification.remaining} pending` : ""}
                        {issues > 0 ? ` · ${notification.failed} failed · ${notification.skipped} skipped · ${notification.unknown} uncertain` : ""}
                      </p>
                    )}
                    {notification.status === "scheduled" && (
                      <Button variant="outline" size="md" disabled={cancelling === notification.id} onClick={() => cancel(notification.id)}>
                        {cancelling === notification.id ? "Cancelling…" : "Cancel alert"}
                      </Button>
                    )}
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
