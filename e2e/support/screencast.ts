// Records real app motion for marketing clips.
//
// The E2E build exposes the webview's DevTools on DEBUG_PORT (see
// tauri.e2e.conf.json), so this attaches a second DevTools client next to
// msedgedriver and streams the page's own composited frames with
// Page.startScreencast. That captures only the app's webview: nothing else on
// the desktop can cover it or end up in a frame.
//
// The screencast sends a frame only when the page repaints, so each frame keeps
// its timestamp and the clip is assembled with per-frame durations, then
// resampled to a constant 30 fps by FFmpeg (which must be on PATH).

import { execFileSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const DEBUG_PORT = 9222;

type Frame = { file: string; t: number };

export class Screencast {
  private ws!: WebSocket;
  private nextId = 0;
  private pending = new Map<number, (result: unknown) => void>();
  private frames: Frame[] = [];
  private dir = "";
  private stoppedAt = 0;

  /** Attach to the main window's page target. */
  async connect(): Promise<void> {
    const targets = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()) as {
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    // Tool windows are separate targets with ?tool= in their URL; the main window has none.
    const page = targets.find((t) => t.type === "page" && !t.url.includes("tool=")) ?? targets.find((t) => t.type === "page");
    if (!page) throw new Error("no page target on the DevTools port");
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("DevTools socket failed to open")));
    });
    this.ws.addEventListener("message", (event) => this.onMessage(JSON.parse(String(event.data))));
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private onMessage(message: { id?: number; method?: string; params?: Record<string, unknown> }) {
    if (message.id && this.pending.has(message.id)) {
      this.pending.get(message.id)!(message);
      this.pending.delete(message.id);
      return;
    }
    if (message.method === "Page.screencastFrame" && this.dir) {
      const params = message.params as { data: string; sessionId: number; metadata: { timestamp: number } };
      const file = `frame-${String(this.frames.length).padStart(5, "0")}.jpg`;
      writeFileSync(join(this.dir, file), Buffer.from(params.data, "base64"));
      this.frames.push({ file, t: params.metadata.timestamp });
      void this.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    }
  }

  /** Record `action` into `<outDir>/<name>.mp4`, holding `tail` seconds on the last frame. */
  async record(outDir: string, name: string, action: () => Promise<void>, tail = 0.6): Promise<string> {
    this.dir = join(outDir, `${name}-frames`);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.frames = [];

    await this.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 1 });
    try {
      await action();
    } finally {
      // Let the last repaint arrive before stopping. Frame timestamps are wall-clock
      // seconds, so the clip ends at the real stop time rather than at the last
      // repaint: a still screen sends no frames, and its hold must not be dropped.
      await new Promise((r) => setTimeout(r, 300));
      this.stoppedAt = Date.now() / 1000;
      await this.send("Page.stopScreencast");
      this.dir = "";
    }

    const framesDir = join(outDir, `${name}-frames`);
    const stopAt = Math.max(this.stoppedAt, this.frames.at(-1)!.t) + tail;
    const lines = ["ffconcat version 1.0"];
    this.frames.forEach((frame, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : stopAt;
      lines.push(`file '${frame.file}'`, `duration ${Math.max(next - frame.t, 0.001).toFixed(4)}`);
    });
    // The concat demuxer ignores the last entry's duration unless the file is repeated.
    lines.push(`file '${this.frames.at(-1)!.file}'`);
    writeFileSync(join(framesDir, "list.ffconcat"), lines.join("\n"));

    const out = join(outDir, `${name}.mp4`);
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", join(framesDir, "list.ffconcat"),
      "-vf", "fps=30,scale=1600:1000:flags=lanczos:force_original_aspect_ratio=decrease,pad=1600:1000:(ow-iw)/2:(oh-ih)/2",
      "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-an", out,
    ]);
    return out;
  }

  close(): void {
    this.ws?.close();
  }
}
