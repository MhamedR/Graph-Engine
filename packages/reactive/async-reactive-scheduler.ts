import type {ReactiveEffectScheduleHandle} from './reactive-scheduler-options.js';

/**
 * Work accepted by AsyncReactiveScheduler.
 */
export type AsyncScheduledTask = () => void | PromiseLike<void>;

interface AsyncScheduledTaskEntry {
  readonly task: AsyncScheduledTask;
}

/**
 * FIFO scheduler that explicitly awaits asynchronous tasks.
 *
 * One flush captures one batch. Tasks added while the batch is awaiting are
 * retained for the next flush, preserving the same boundary as the synchronous
 * scheduler.
 */
export class AsyncReactiveScheduler {
  private readonly queue: AsyncScheduledTaskEntry[] = [];
  private _flushing = false;

  schedule(task: AsyncScheduledTask): ReactiveEffectScheduleHandle {
    const entry = {task};
    this.queue.push(entry);
    let cancelled = false;

    return {
      cancel: (): void => {
        if (cancelled) return;
        cancelled = true;

        const index = this.queue.indexOf(entry);

        if (index !== -1) {
          this.queue.splice(index, 1);
        }
      },
    };
  }

  clear(): void {
    this.queue.length = 0;
  }

  get hasPendingWork(): boolean {
    return this.queue.length > 0;
  }

  get isFlushing(): boolean {
    return this._flushing;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Executes the current batch sequentially and reports its first failure
   * after all captured tasks settle.
   */
  async flush(): Promise<void> {
    if (this._flushing) {
      throw new Error('Async reactive scheduler cannot be flushed recursively.');
    }

    const batch = this.queue.splice(0);
    let firstError: unknown;
    let hasError = false;
    this._flushing = true;

    try {
      for (const entry of batch) {
        try {
          // Tasks are intentionally serialized to preserve FIFO settlement.
          // eslint-disable-next-line no-await-in-loop
          await entry.task();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
    } finally {
      this._flushing = false;
    }

    if (hasError) {
      throw firstError;
    }
  }

  /**
   * Executes and awaits at most one pending task.
   */
  async flushOne(): Promise<void> {
    if (this._flushing) {
      throw new Error('Async reactive scheduler cannot be flushed recursively.');
    }

    const entry = this.queue.shift();

    if (entry === undefined) return;

    this._flushing = true;

    try {
      await entry.task();
    } finally {
      this._flushing = false;
    }
  }
}
