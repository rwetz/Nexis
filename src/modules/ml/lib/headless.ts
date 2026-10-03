// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Headless inference: a `nexis-ml serve` session owned by code, not by the
 * panel's Playground. The chat tools (`model-tools.ts`) use it so a language
 * model can query a trained model.
 *
 * The engine's event stream is one shared channel, and the store adopts an
 * unstamped session's first batch by its shape (a `ready` line while its own
 * serve is pending) and treats an unmatched exit during an install as the
 * install's. A headless session's sid is therefore registered here *before*
 * its events are routed, and the store drops every event for a registered sid.
 *
 * What remains is the spawn window: events can arrive before `ml_spawn`
 * resolves with the sid. This side buffers every unclaimed batch and replays
 * the ones for its sid once known. The store side is covered by waiting for
 * the panel to have no session of its own in that same window (`waitForQuiet`).
 * Two spawns racing within the same few milliseconds is the one case left.
 */
import {
  killRun,
  sendInfer,
  spawnServe,
  subscribeMlEventsAttached,
  type ExitPayload,
  type ProtoPayload,
} from "./engine-bridge";
import { parseServeLine, type ServeEvent, type ServeMeta } from "./protocol";

const headless = new Set<number>();

/** True for a sid a headless session owns. The store ignores these. */
export function isHeadlessSid(sid: number): boolean {
  return headless.has(sid);
}

export type Prediction = Extract<ServeEvent, { ev: "prediction" }>;

export type HeadlessSession = {
  template: string | null;
  device: string | null;
  meta: ServeMeta;
  /** One request, one answer. Rejects on an engine `error` event. */
  infer: (request: unknown) => Promise<Prediction>;
};

export type HeadlessOptions = {
  exe: string;
  projectDir: string;
  runId: string;
  /** Resolves once the panel has no unstamped session of its own. */
  waitForQuiet?: () => Promise<void>;
  readyTimeoutMs?: number;
  inferTimeoutMs?: number;
};

// One headless session at a time: the AI SDK runs parallel tool calls
// concurrently, and each would otherwise load its own copy of the model.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Start a serve session, run `fn` against it, and always stop it after.
 * Sessions are serialized, so concurrent callers wait their turn.
 */
export function withHeadlessSession<T>(
  opts: HeadlessOptions,
  fn: (session: HeadlessSession) => Promise<T>,
): Promise<T> {
  const run = queue.then(() => runSession(opts, fn));
  queue = run.catch(() => undefined);
  return run;
}

type Waiter = {
  resolve: (ev: ServeEvent) => void;
  reject: (err: Error) => void;
};

async function runSession<T>(
  opts: HeadlessOptions,
  fn: (session: HeadlessSession) => Promise<T>,
): Promise<T> {
  const readyTimeout = opts.readyTimeoutMs ?? 120_000;
  const inferTimeout = opts.inferTimeoutMs ?? 30_000;
  let sid: number | null = null;
  const unclaimed: ProtoPayload[] = [];
  const pending: ServeEvent[] = [];
  let waiter: Waiter | null = null;
  let exited: ExitPayload | null = null;
  const stderr: string[] = [];

  const deliver = (ev: ServeEvent) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(ev);
    } else {
      pending.push(ev);
    }
  };
  const route = (payload: ProtoPayload) => {
    for (const line of payload.lines) {
      const ev = parseServeLine(line);
      if (ev) deliver(ev);
    }
  };
  const fail = (msg: string) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(new Error(msg));
    }
  };
  const exitMessage = () => {
    const tail = stderr.slice(-3).join(" | ");
    return `the engine stopped (exit ${exited?.code ?? "?"})${tail ? `: ${tail}` : ""}`;
  };

  const unsubscribe = await subscribeMlEventsAttached({
    onProto: (payload) => {
      if (sid === null) unclaimed.push(payload);
      else if (payload.sid === sid) route(payload);
    },
    onStderr: (payload) => {
      if (payload.sid === sid) stderr.push(payload.line);
    },
    onExit: (payload) => {
      if (payload.sid !== sid) return;
      exited = payload;
      fail(exitMessage());
    },
  });

  const next = (timeoutMs: number, what: string) =>
    new Promise<ServeEvent>((resolve, reject) => {
      const queued = pending.shift();
      if (queued) return resolve(queued);
      if (exited) return reject(new Error(exitMessage()));
      const timer = setTimeout(() => {
        waiter = null;
        reject(new Error(`timed out waiting for ${what}`));
      }, timeoutMs);
      waiter = {
        resolve: (ev) => {
          clearTimeout(timer);
          resolve(ev);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
    });

  try {
    await opts.waitForQuiet?.();
    sid = await spawnServe(opts.exe, opts.projectDir, opts.runId);
    headless.add(sid);
    for (const payload of unclaimed.splice(0)) {
      if (payload.sid === sid) route(payload);
    }

    const ready = await next(readyTimeout, "the model to load");
    if (ready.ev === "error") throw new Error(ready.msg);
    if (ready.ev !== "ready") throw new Error(`unexpected first event "${ready.ev}"`);

    let busy = false;
    const session: HeadlessSession = {
      template: ready.template ?? null,
      device: ready.device ?? null,
      meta: ready.meta ?? {},
      async infer(request) {
        if (busy) throw new Error("one request at a time per session");
        busy = true;
        try {
          await sendInfer(sid!, request);
          const ev = await next(inferTimeout, "a prediction");
          if (ev.ev === "error") throw new Error(ev.msg);
          if (ev.ev !== "prediction") throw new Error(`unexpected event "${ev.ev}"`);
          return ev;
        } finally {
          busy = false;
        }
      },
    };
    return await fn(session);
  } finally {
    unsubscribe();
    if (sid !== null) {
      const own = sid;
      if (!exited) await killRun(own).catch(() => undefined);
      // Keep the sid registered briefly: its exit event is still in flight
      // and must not reach the store as an unmatched exit.
      setTimeout(() => headless.delete(own), 10_000);
    }
  }
}
