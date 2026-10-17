"use client";

import { useRouter } from "next/navigation";
import { PhoneOtpForm } from "@/components/PhoneOtpForm";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  return (
    <PhoneOtpForm
      onVerified={async () => {
        router.replace(next);
        router.refresh();
      }}
    />
  );
}
