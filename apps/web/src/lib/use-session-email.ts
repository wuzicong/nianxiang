"use client";

import { useCallback, useEffect, useState } from "react";

export function useSessionEmail() {
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/auth/me", { credentials: "include" });
    if (!response.ok) {
      setEmail(null);
      return;
    }
    const body = (await response.json()) as { user?: { email?: string } };
    setEmail(body.user?.email ?? null);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setEmail(null));
  }, [refresh]);

  return email;
}
