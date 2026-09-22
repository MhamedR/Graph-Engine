import {
  ReactiveEffectScheduleHandle,
  ReactiveEffectScheduler,
} from './reactive-scheduler-options.js';
import {assertSynchronousScheduledTaskResult} from './scheduler.js';

interface ManualEffectTaskEntry {
  readonly task: () => void;
}

/**
 * A scheduler that stores effect tasks until the caller explicitly flushes
 * them.
 *
 * This is useful for deterministic tests and for callers that want direct
 * control over when scheduled reactive work executes.
 */
export class ManualEffectScheduler implements ReactiveEffectScheduler {
  private readonly tasks: ManualEffectTaskEntry[] = [];
  private _flushing = false;

  /**
   * Adds an effect task to the pending queue.
   *
   * @param task - Effect execution to defer.
   * @returns Handle that can remove the task before execution.
   */
  schedule(task: () => void): ReactiveEffectScheduleHandle {
    // Store the task in the scheduler queue.
    const entry = {task};
    this.tasks.push(entry);

    // Track whether this handle has already cancelled its task.
    let cancelled = false;

    return {
      /**
       * Cancels this scheduled task.
       */
      cancel: (): void => {
        // Cancellation is intentionally idempotent.
        if (cancelled) {
          return;
        }

        cancelled = true;

        // Remove the task from the queue if it has not executed yet.
        const index = this.tasks.indexOf(entry);

        if (index !== -1) {
          this.tasks.splice(index, 1);
        }
      },
    };
  }

  /**
   * Executes all currently pending tasks.
   *
   * Tasks scheduled while flushing are left for a later flush.
   *
   * If a task throws, the remaining tasks in the current batch still run.
   * The first error is rethrown after the batch completes.
   *
   * @throws {unknown} The first error thrown by a scheduled task.
   */
  flush(): void {
    if (this._flushing) {
      throw new Error('Manual effect scheduler cannot be flushed recursively.');
    }

    // Capture the current batch so tasks scheduled during execution remain
    // queued for the next flush cycle.
    const batch = this.tasks.splice(0);

    // Remember the first task error without interrupting the remaining tasks.
    let firstError: unknown;
    let hasError = false;

    this._flushing = true;

    try {
      // Execute every task that was pending when the flush started.
      for (const entry of batch) {
        try {
          assertSynchronousScheduledTaskResult(entry.task());
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
   * Indicates whether pending effect work exists.
   *
   * @returns `true` when at least one task is waiting to execute.
   */
  get hasPendingWork(): boolean {
    // Report whether the scheduler currently contains any pending tasks.
    return this.tasks.length > 0;
  }

  /**
   * Returns the number of pending effect tasks.
   *
   * @returns Number of tasks waiting to execute.
   */
  get pendingCount(): number {
    // Expose the current queue size for diagnostics and tests.
    return this.tasks.length;
  }

  /**
   * Removes all pending tasks without executing them.
   */
  clear(): void {
    // Discard queued work explicitly requested by the caller.
    this.tasks.length = 0;
  }
}
