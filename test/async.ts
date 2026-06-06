// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * async.ts — Nexis editor playground
 * Exercises: async/await, Promise combinators, async generators,
 *            AbortController, ReadableStream, structured concurrency patterns.
 */

// ── Basics ────────────────────────────────────────────────────────────────────

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Timed out after ${ms}ms`
): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(message)), ms)
  try {
    return await Promise.race([promise, delay(ms, ac.signal).then(() => { throw new Error(message) })])
  } finally {
    clearTimeout(timer)
  }
}

// ── Promise combinators ───────────────────────────────────────────────────────

type Result<T> = { ok: true; value: T } | { ok: false; error: unknown }

async function settled<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await p }
  } catch (error) {
    return { ok: false, error }
  }
}

async function allSettledTyped<T extends readonly Promise<unknown>[]>(
  promises: T
): Promise<{ [K in keyof T]: Result<Awaited<T[K]>> }> {
  return Promise.all(promises.map(settled)) as never
}

// ── Retry with backoff ────────────────────────────────────────────────────────

interface RetryOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
  backoff?: "linear" | "exponential" | "jitter"
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delay: number) => void
}

async function retry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay   = 1000,
    maxDelay    = 30000,
    backoff     = "exponential",
    shouldRetry = () => true,
    onRetry,
  } = options

  const ac = new AbortController()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt, ac.signal)
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) throw error

      const base = backoff === "linear"
        ? baseDelay * attempt
        : Math.min(baseDelay * 2 ** (attempt - 1), maxDelay)

      const jitter = backoff === "jitter"
        ? Math.random() * base
        : 0

      const wait = Math.min(base + jitter, maxDelay)
      onRetry?.(error, attempt, wait)
      await delay(wait, ac.signal)
    }
  }

  throw new Error("unreachable")
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--
      return this.makeRelease()
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.permits--
        resolve(this.makeRelease())
      })
    })
  }

  private makeRelease(): () => void {
    return () => {
      this.permits++
      const next = this.queue.shift()
      next?.()
    }
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const sem = new Semaphore(concurrency)
  return Promise.all(
    items.map(async (item, index) => {
      const release = await sem.acquire()
      try {
        return await fn(item, index)
      } finally {
        release()
      }
    })
  )
}

// ── Async generators ──────────────────────────────────────────────────────────

async function* range(
  start: number,
  end: number,
  step = 1
): AsyncGenerator<number> {
  for (let i = start; i < end; i += step) {
    await delay(0)  // yield to microtask queue
    yield i
  }
}

async function* paginate<T>(
  fetcher: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
  initialCursor: string | null = null
): AsyncGenerator<T> {
  let cursor: string | null = initialCursor

  do {
    const { items, nextCursor } = await fetcher(cursor)
    for (const item of items) {
      yield item
    }
    cursor = nextCursor
  } while (cursor !== null)
}

async function* takeWhile<T>(
  gen: AsyncGenerator<T>,
  predicate: (value: T) => boolean
): AsyncGenerator<T> {
  for await (const value of gen) {
    if (!predicate(value)) break
    yield value
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of gen) {
    result.push(item)
  }
  return result
}

// ── ReadableStream ─────────────────────────────────────────────────────────────

function createTickerStream(
  interval: number,
  count: number
): ReadableStream<{ tick: number; ts: number }> {
  let i = 0
  let timer: ReturnType<typeof setInterval>

  return new ReadableStream({
    start(controller) {
      timer = setInterval(() => {
        controller.enqueue({ tick: i++, ts: Date.now() })
        if (i >= count) {
          controller.close()
          clearInterval(timer)
        }
      }, interval)
    },
    cancel() {
      clearInterval(timer)
    },
  })
}

async function consumeStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const result: T[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return result
}

// ── Deferred / Promise.withResolvers ─────────────────────────────────────────

class Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject:  (reason?: unknown) => void

  constructor() {
    let res!: (v: T | PromiseLike<T>) => void
    let rej!: (r?: unknown) => void
    this.promise = new Promise<T>((r, j) => { res = r; rej = j })
    this.resolve = res
    this.reject  = rej
  }
}

// ── Event-to-promise ──────────────────────────────────────────────────────────

function once<T = Event>(
  target: EventTarget,
  event: string,
  options: AddEventListenerOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (e: Event) => resolve(e as unknown as T)
    target.addEventListener(event, handler, { ...options, once: true })
    options.signal?.addEventListener("abort", () => {
      target.removeEventListener(event, handler)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

// ── Observable-like / async queue ─────────────────────────────────────────────

class AsyncQueue<T> {
  private queue:   T[]            = []
  private waiting: Array<(v: T) => void> = []
  private closed   = false

  push(value: T): void {
    if (this.closed) throw new Error("Queue is closed")
    const waiter = this.waiting.shift()
    if (waiter) {
      waiter(value)
    } else {
      this.queue.push(value)
    }
  }

  close(): void {
    this.closed = true
  }

  async next(): Promise<T | null> {
    if (this.queue.length > 0) return this.queue.shift()!
    if (this.closed) return null
    return new Promise(resolve => this.waiting.push(resolve))
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      const item = await this.next()
      if (item === null) return
      yield item
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("── Promise combinators ──")
  const results = await allSettledTyped([
    Promise.resolve(42),
    Promise.reject(new Error("boom")),
    delay(10).then(() => "hello"),
  ])
  for (const r of results) {
    console.log(" ", r.ok ? `ok: ${r.value}` : `err: ${(r.error as Error).message}`)
  }

  console.log("\n── Retry with backoff ──")
  let attempts = 0
  const result = await retry(
    async (attempt) => {
      attempts = attempt
      if (attempt < 3) throw new Error(`fail #${attempt}`)
      return "success after 3 attempts"
    },
    {
      maxAttempts: 5,
      baseDelay:   10,
      backoff:     "exponential",
      onRetry: (err, attempt, wait) =>
        console.log(`  attempt ${attempt} failed (${(err as Error).message}), retrying in ${wait}ms`),
    }
  )
  console.log(`  result: ${result} (total attempts: ${attempts})`)

  console.log("\n── Concurrent map (concurrency=2) ──")
  const start = Date.now()
  const concurrentResults = await mapConcurrent(
    [50, 80, 60, 40, 70],
    2,
    (ms, i) => delay(ms).then(() => `task-${i}(${ms}ms)`)
  )
  console.log(`  ${concurrentResults.join(", ")} [${Date.now() - start}ms]`)

  console.log("\n── Async generator: range ──")
  const nums = await collect(takeWhile(range(0, 20, 3), n => n < 15))
  console.log(`  ${nums}`)

  console.log("\n── ReadableStream ──")
  const ticks = await consumeStream(createTickerStream(20, 5))
  console.log(`  ticks: ${ticks.map(t => t.tick).join(", ")}`)

  console.log("\n── AsyncQueue ──")
  const q = new AsyncQueue<string>()
  setTimeout(() => { q.push("a"); q.push("b"); q.push("c"); q.close() }, 10)
  for await (const item of q) {
    console.log(`  dequeued: ${item}`)
  }

  console.log("\nDone.")
}

main().catch(console.error)

export {
  delay, withTimeout, settled, allSettledTyped,
  retry, Semaphore, mapConcurrent,
  range, paginate, takeWhile, collect,
  createTickerStream, consumeStream,
  Deferred, AsyncQueue,
}
