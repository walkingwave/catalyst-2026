"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";
import { Button, Input, Field } from "@/components/ui";

type Props = {
  /** Ask for a name (first-time claim). */
  withName?: boolean;
  /** Called after OTP verified. Return an error string to show, or nothing. */
  onVerified: (info: { name: string; phone: string }) => Promise<string | void>;
  submitLabel?: string;
};

export function PhoneOtpForm({ withName = false, onVerified, submitLabel = "Continue" }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [name, setName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizePhone(phoneInput);
    if (!normalized) return setError("Enter a valid phone number.");
    if (withName && name.trim().length < 1) return setError("Enter your name.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: withName ? { data: { name: name.trim() } } : undefined,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setPhone(normalized);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const err = await onVerified({ name: name.trim(), phone });
    setBusy(false);
    if (err) setError(err);
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4">
        <Field label={`Code sent to ${phone}`}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
        </Field>
        {error && <p className="t-foot text-danger">{error}</p>}
        <Button type="submit" disabled={busy || code.length < 4}>
          {busy ? "Checking…" : "Confirm"}
        </Button>
        <Button type="button" variant="outline" size="md" onClick={() => setStep("phone")} disabled={busy}>
          Use a different number
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4">
      {withName && (
        <Field label="Name">
          <Input
            placeholder="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </Field>
      )}
      <Field label="Phone">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Phone number"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          required
        />
      </Field>
      {error && <p className="t-foot text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
