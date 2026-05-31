/**
 * useAgentQueueStore — Zustand store for the background agent task queue.
 *
 * Tasks are processed sequentially: when a task is running we watch
 * useChatStore.agentMeta.status.  Once the agent goes busy then returns to
 * idle/error, we mark the task done and start the next one.
 */
import { create } from "zustand";
import { sendMessage, useChatStore } from "@/modules/ai/store/chatStore";

export type QueueTaskStatus = "queued" | "running" | "done" | "failed";

export type QueueTask = {
  id: string;
  prompt: string;
  /** Short user-visible title derived from prompt. */
  label: string;
  status: QueueTaskStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
};

type QueueState = {
  tasks: QueueTask[];
  /** Add a task and return its id. */
  addTask: (prompt: string, label?: string) => string;
  removeTask: (id: string) => void;
  clearDone: () => void;
  /** Retry a failed task. */
  retryTask: (id: string) => void;
};

export const useAgentQueueStore = create<QueueState>()((set, get) => ({
  tasks: [],

  addTask: (prompt, label) => {
    const id = crypto.randomUUID();
    const task: QueueTask = {
      id,
      prompt,
      label: label ?? prompt.slice(0, 80).replace(/\n/g, " "),
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    scheduleProcessNext(get);
    return id;
  },

  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  clearDone: () =>
    set((s) => ({
      tasks: s.tasks.filter(
        (t) => t.status === "queued" || t.status === "running",
      ),
    })),

  retryTask: (id) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id && (t.status === "failed" || t.status === "done")
          ? {
              ...t,
              status: "queued" as const,
              startedAt: null,
              completedAt: null,
            }
          : t,
      ),
    }));
    scheduleProcessNext(get);
  },
}));

// ── Queue worker ──────────────────────────────────────────────────────────────

let workerBusy = false;

function scheduleProcessNext(get: () => QueueState) {
  if (workerBusy) return;
  const alreadyRunning = get().tasks.some((t) => t.status === "running");
  if (alreadyRunning) return;
  void processNext(get);
}

async function processNext(get: () => QueueState) {
  const task = get().tasks.find((t) => t.status === "queued");
  if (!task) return;

  workerBusy = true;

  // Mark as running
  useAgentQueueStore.setState((s) => ({
    tasks: s.tasks.map((t) =>
      t.id === task.id
        ? { ...t, status: "running" as const, startedAt: Date.now() }
        : t,
    ),
  }));

  // Open AI panel so the user can see output
  useChatStore.getState().openPanel();

  try {
    // Subscribe BEFORE sending so we don't miss the status flip
    const completionPromise = waitForAgentCompletion();
    const sent = await sendMessage(task.prompt);

    if (!sent) {
      throw new Error(
        "sendMessage returned false — check AI provider configuration",
      );
    }

    await completionPromise;

    // Mark done
    useAgentQueueStore.setState((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === task.id
          ? { ...t, status: "done" as const, completedAt: Date.now() }
          : t,
      ),
    }));
  } catch {
    useAgentQueueStore.setState((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === task.id
          ? { ...t, status: "failed" as const, completedAt: Date.now() }
          : t,
      ),
    }));
  }

  workerBusy = false;

  // Start next queued task if any
  const hasMore = get().tasks.some((t) => t.status === "queued");
  if (hasMore) {
    void processNext(get);
  }
}

/**
 * Resolves once the AI agent transitions from busy back to idle/error.
 * The subscription is set up *before* sendMessage is called so no status
 * change can slip through the gap.  A 10-minute timeout is the safety net.
 */
function waitForAgentCompletion(): Promise<void> {
  return new Promise<void>((resolve) => {
    let sawBusy = false;

    const unsub = useChatStore.subscribe((state) => {
      const isBusy =
        state.agentMeta.status === "thinking" ||
        state.agentMeta.status === "streaming";
      if (isBusy) {
        sawBusy = true;
      } else if (sawBusy) {
        // Transitioned busy → not-busy
        unsub();
        clearTimeout(timeoutId);
        resolve();
      }
    });

    // 10-minute safety timeout
    const timeoutId = setTimeout(() => {
      unsub();
      resolve();
    }, 10 * 60 * 1000);
  });
}
