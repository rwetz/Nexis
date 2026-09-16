// Included only by the dedicated E2E Vite mode. Shipping builds eliminate the
// guarded import in main.tsx; the harness tests real frontend/native adapters.
import { filesystem } from "@/platform/filesystem";
import { shellSessions } from "@/platform/processes";
import { useWorkspaceEnvStore, type WorkspaceEnv } from "@/platform/workspaces";
import {
  openPty,
  type PtySession,
} from "@/modules/terminal/lib/pty-bridge";

type TerminalProbe = { session: PtySession | null; output: string };
const terminalProbes = new Map<number, TerminalProbe>();
const CURSOR_POSITION_QUERY = "\u001b[6n";
const CURSOR_POSITION_RESPONSE = "\u001b[1;1R";

async function terminalStart(cwd: string, environment: WorkspaceEnv) {
  useWorkspaceEnvStore.getState().setEnv(environment);
  const probe: TerminalProbe = { session: null, output: "" };
  const decoder = new TextDecoder();
  const session = await openPty(
    100,
    30,
    {
      onData: (bytes) => {
        const text = decoder.decode(bytes, { stream: true });
        probe.output += text;
        if (text.includes(CURSOR_POSITION_QUERY)) {
          void probe.session?.write(CURSOR_POSITION_RESPONSE);
        }
      },
    },
    cwd,
    undefined,
    environment.kind === "local" ? "powershell.exe" : undefined,
  );
  probe.session = session;
  if (probe.output.includes(CURSOR_POSITION_QUERY)) {
    await session.write(CURSOR_POSITION_RESPONSE);
  }
  terminalProbes.set(session.id, probe);
  return session.id;
}

async function terminalWrite(id: number, data: string) {
  const session = terminalProbes.get(id)?.session;
  if (!session) throw new Error(`Unknown terminal probe: ${id}`);
  // One burst matches xterm paste/input delivery and verifies that the native
  // FIFO preserves every byte. Separate concurrent IPC requests have no
  // transport-level ordering guarantee and are not the production contract.
  await session.write(data);
}

function terminalOutput(id: number) {
  return terminalProbes.get(id)?.output ?? "";
}

async function terminalClose(id: number) {
  const probe = terminalProbes.get(id);
  terminalProbes.delete(id);
  await probe?.session?.close();
}

async function processCycle(cwd: string, environment: WorkspaceEnv) {
  useWorkspaceEnvStore.getState().setEnv(environment);
  const session = await shellSessions.open(cwd);
  try {
    const result = await session.run("echo NEXIS_E2E_PROCESS", {
      timeoutSecs: 10,
    });
    if (result.exit_code !== 0 || !result.stdout.includes("NEXIS_E2E_PROCESS"))
      throw new Error(JSON.stringify(result));
    return result.cwd_after;
  } finally {
    await session.close();
  }
}

async function wslFiles(root: string, distro: string) {
  useWorkspaceEnvStore.getState().setEnv({ kind: "wsl", distro });
  // WebDriver retries a failed execute request with the same arguments. Clean
  // the isolated path first so a retry diagnoses the original failure instead
  // of getting masked by an "already exists" error from the first attempt.
  await filesystem.delete(root).catch(() => {});
  try {
    await filesystem.createDir(root);
    await filesystem.writeFile(`${root}/a.txt`, "first", "e2e");
    await filesystem.writeFile(`${root}/a.txt`, "replacement", "e2e");
    await filesystem.rename(`${root}/a.txt`, `${root}/b.txt`);
    const result = await filesystem.readFile(`${root}/b.txt`);
    if (result.kind !== "text" || result.content !== "replacement")
      throw new Error("WSL atomic write/rename mismatch");
    return await processCycle(root, { kind: "wsl", distro });
  } finally {
    await filesystem.delete(root);
  }
}

const desktopApi = {
  terminalStart,
  terminalWrite,
  terminalOutput,
  terminalClose,
  processCycle,
  wslFiles,
};
declare global {
  interface Window {
    nexisE2e: typeof desktopApi;
  }
}
window.nexisE2e = desktopApi;
