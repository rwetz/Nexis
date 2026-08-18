// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * PortsPanel — detects locally listening TCP ports and surfaces them with
 * a one-click "Open in Preview" button.  Runs `ss` / `lsof` / `netstat`
 * depending on the platform via the existing shell_run_command IPC.
 */
import { Icon } from "@/components/icon";
import { IS_WINDOWS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

type ListeningPort = {
  port: number;
  address: string;
  process: string;
};

type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

// Ports that are unlikely to be developer web servers (skip in the UI badge count).
const NOISE_PORTS = new Set([22, 25, 53, 110, 143, 443, 445, 587, 993, 995]);

async function detectPorts(): Promise<ListeningPort[]> {
  const ports: ListeningPort[] = [];

  try {
    let stdout = "";
    if (IS_WINDOWS) {
      // netstat -ano lists all TCP listeners with PID
      const out = await invoke<CommandOutput>("shell_run_command", {
        command: "netstat -ano -p TCP",
        cwd: null,
        timeoutSecs: 10,
      });
      stdout = out.stdout;
      for (const line of stdout.split(/\r?\n/)) {
        // LISTENING lines look like:  TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234
        const m = line.match(/TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m) {
          ports.push({ address: m[1], port: parseInt(m[2], 10), process: `PID ${m[3]}` });
        }
      }
    } else {
      // Try ss first (Linux), fall back to lsof (macOS/Linux)
      const ssOut = await invoke<CommandOutput>("shell_run_command", {
        command: "ss -tlnp 2>/dev/null || lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null",
        cwd: null,
        timeoutSecs: 10,
      });
      stdout = ssOut.stdout;

      if (stdout.includes("LISTEN")) {
        // ss output: State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
        for (const line of stdout.split(/\r?\n/)) {
          const ssMatch = line.match(/LISTEN\s+\d+\s+\d+\s+(\S+):(\d+)\s+/);
          if (ssMatch) {
            const procMatch = line.match(/users:\(\("([^"]+)"/);
            ports.push({
              address: ssMatch[1],
              port: parseInt(ssMatch[2], 10),
              process: procMatch ? procMatch[1] : "",
            });
            continue;
          }
          // lsof output: COMMAND PID USER ... TCP *:port (LISTEN)
          const lsofMatch = line.match(/^(\S+)\s+\d+\s+\S+\s+\S+\s+IPv[46]\s+\S+\s+\S+\s+TCP\s+[^:]+:(\d+)\s+\(LISTEN\)/);
          if (lsofMatch) {
            ports.push({ address: "*", port: parseInt(lsofMatch[2], 10), process: lsofMatch[1] });
          }
        }
      }
    }
  } catch {
    // Detection failure is non-fatal
  }

  // Deduplicate by port, prefer entries with process names
  const seen = new Map<number, ListeningPort>();
  for (const p of ports) {
    const existing = seen.get(p.port);
    if (!existing || (!existing.process && p.process)) {
      seen.set(p.port, p);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.port - b.port);
}

function isWebPort(port: number): boolean {
  return !NOISE_PORTS.has(port) && (
    port >= 1024 ||
    port === 80 ||
    port === 443 ||
    port === 8080
  );
}

type Props = {
  onOpenPreview: (url: string) => void;
};

export function PortsPanel({ onOpenPreview }: Props) {
  const [ports, setPorts] = useState<ListeningPort[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await detectPorts();
      setPorts(result);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 5s
  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const webPorts = ports.filter((p) => isWebPort(p.port));
  const otherPorts = ports.filter((p) => !isWebPort(p.port));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Forwarded Ports
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Icon name="refresh" className={cn(loading && "nexis-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ports.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Icon name="globe" size="xl" className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No listening ports detected.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Start a dev server to see it here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {webPorts.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Web / Dev servers
                </p>
                {webPorts.map((p) => (
                  <PortRow key={p.port} port={p} onOpenPreview={onOpenPreview} />
                ))}
              </>
            )}
            {otherPorts.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Other
                </p>
                {otherPorts.map((p) => (
                  <PortRow key={p.port} port={p} onOpenPreview={onOpenPreview} showOpen={false} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PortRow({
  port,
  onOpenPreview,
  showOpen = true,
}: {
  port: ListeningPort;
  onOpenPreview: (url: string) => void;
  showOpen?: boolean;
}) {
  const url = `http://localhost:${port.port}`;

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10">
        <Icon name="globe" size="xs" className="text-primary/70" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tabular-nums">:{port.port}</p>
        {port.process && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {port.process}
          </p>
        )}
      </div>
      {showOpen && (
        <button
          type="button"
          title={`Open ${url}`}
          onClick={() => onOpenPreview(url)}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <Icon name="link-external" size="xs" />
          Open
        </button>
      )}
    </div>
  );
}
