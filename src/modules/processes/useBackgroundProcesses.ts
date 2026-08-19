// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native } from "@/modules/ai/lib/native";
import { useEffect, useRef, useState } from "react";

export type BgProcess = {
  handle: number;
  command: string;
  cwd: string | null;
  started_at_ms: number;
  exited: boolean;
  exit_code: number | null;
};

export function useBackgroundProcesses(pollMs = 2000) {
  const [processes, setProcesses] = useState<BgProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set false on unmount so a poll still in flight cannot resolve into a
  // component that is gone, and so a slow reply from a previous interval
  // cannot overwrite a newer one.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = async () => {
    try {
      const list = await native.shellBgList();
      if (aliveRef.current) setProcesses(list);
    } catch {
      // backend not ready or no processes yet
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    timerRef.current = setInterval(() => void refresh(), pollMs);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  const kill = async (handle: number) => {
    await native.shellBgKill(handle);
    await refresh();
  };

  return { processes, loading, refresh, kill };
}
