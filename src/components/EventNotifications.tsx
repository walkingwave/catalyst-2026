"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, Field, Panel, SectionHeader } from "@/components/ui";
import type { EventNotification } from "@/lib/event-notifications";

type Overview = {
  event: { id: string; name: string };
  notifications: EventNotification[];
  audience: { fans: number; phones: number };
  sms_enabled: boolean;
};

/** Shared event alert composer for admin and staff; the parent owns the PIN. Alerts send immediately. */
export function EventNotifications({ eventId, headers }: { eventId: string; headers: () => HeadersInit }) {
  const [data, setData] = useState<Overview | null>(null);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"inbox" | "sms">("inbox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<{ payload: string; id: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/notifications?concert_id=${eventId}`, { headers: headers(), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not load alerts.");
      setData(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load alerts.");
    }
  }, [eventId, headers]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const payload = { concert_id: eventId, body: body.trim(), channel };
    const fingerprint = JSON.stringify(payload);
    // Retrying the same message reuses its ID, so a lost response never sends it twice.
    if (request.current?.payload !== fingerprint) request.current = { payload: fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST", headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ ...payload, id: request.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not send alert.");
      const sent = result.notification as EventNotification | null;
      setNotice(sent ? `Sent to ${sent.recipients} fan${sent.recipients === 1 ? "" : "s"}.` : "Alert sent.");
      setBody("");
      request.current = null;
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not confirm the result. Check history before sending another message.");
    } finally {
      setBusy(false);
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
                {data.audience.fans === 0 && <p className="t-foot text-ink-2">No claimed bands yet.</p>}
                <Button type="submit" disabled={!body.trim() || data.audience.fans === 0 || (channel === "sms" && !data.sms_enabled)}>
                  {busy ? "Sending…" : `Send to ${data.audience.fans} fan${data.audience.fans === 1 ? "" : "s"}`}
                </Button>
              </fieldset>
            </Panel>
          </form>
          {notice && <p role="status" className="t-foot mt-4">{notice}</p>}
          <SectionHeader action={<button type="button" className="h-10 px-2" onClick={() => { setError(null); void load(); }}>Refresh</button>}>Sent</SectionHeader>
          {data.notifications.length === 0 ? <Empty>No event alerts yet.</Empty> : (
            <div className="space-y-3">
              {data.notifications.map((notification) => {
                const issues = notification.failed + notification.skipped + notification.unknown;
                const label = notification.status === "completed" ? issues ? "Completed with issues" : "Completed"
                  : notification.status === "cancelled" ? "Cancelled" : "Sending";
                return (
                  <Panel key={notification.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={issues ? "warning" : notification.status === "completed" ? "success" : "ink"}>{label}</Badge>
                      <span className="label text-ink-2">{notification.channel === "sms" ? "SMS" : "Inbox"}</span>
                    </div>
                    <p className="t-body whitespace-pre-wrap break-words">{notification.body}</p>
                    <p className="t-foot text-ink-2">{new Date(notification.created_at).toLocaleString()}</p>
                    {notification.status !== "cancelled" && (
                      <p className="t-foot text-ink-2">
                        {notification.channel === "sms" ? `${notification.sms_sent} SMS accepted` : `${notification.inbox_count} inbox copies`}
                        {notification.remaining > 0 ? ` · ${notification.remaining} pending` : ""}
                        {issues > 0 ? ` · ${notification.failed} failed · ${notification.skipped} skipped · ${notification.unknown} uncertain` : ""}
                      </p>
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
