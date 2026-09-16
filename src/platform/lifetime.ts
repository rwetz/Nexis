export type Disposable = { dispose(): void };

/** Own asynchronous subscriptions as well as synchronous resources. */
export class Lifetime implements Disposable {
  private closed = false;
  private readonly cleanups = new Set<() => void>();

  get disposed(): boolean {
    return this.closed;
  }

  add(cleanup: () => void): Disposable {
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      this.cleanups.delete(dispose);
      cleanup();
    };
    if (this.closed) dispose();
    else this.cleanups.add(dispose);
    return { dispose };
  }

  async own(pending: Promise<() => void>): Promise<Disposable> {
    return this.add(await pending);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    this.cleanups.clear();
    if (errors.length)
      throw Object.assign(new Error("Resource cleanup failed"), { errors });
  }
}
