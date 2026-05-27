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

  const refresh = async () => {
    try {
      const list = await native.shellBgList();
      setProcesses(list);
    } catch {
      // backend not ready or no processes yet
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    timerRef.current = setInterval(() => void refresh(), pollMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  const kill = async (handle: number) => {
    await native.shellBgKill(handle);
    await refresh();
  };

  return { processes, loading, refresh, kill };
}
