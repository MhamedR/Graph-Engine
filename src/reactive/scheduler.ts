/**
 * Represents a unit of work that can be scheduled for later execution.
 */
export type ScheduledTask = () => void;

/**
 * Provides a minimal scheduling abstraction for the reactive runtime.
 *
 * The scheduler owns pending work but does not decide what that work means.
 * ReactiveRuntime will eventually use this abstraction to coordinate
 * deferred recomputation.
 */
export class ReactiveScheduler {
  private readonly queue: ScheduledTask[] = [];
  /**
   * Tracks whether the scheduler is currently executing a batch.
   *
   * Nested flush calls are rejected so one flush always represents exactly
   * one scheduler batch.
   */
  private _flushing = false;

  /**
   * Adds a task to the scheduler queue.
   *
   * @param task - Function that should be executed later.
   */
  schedule(task: ScheduledTask): void {
    // Store the task until the scheduler is explicitly flushed.
    this.queue.push(task);
  }
  /**
   * Removes all currently pending tasks without executing them.
   *
   * Tasks that are already executing cannot be cancelled. This method only
   * removes work that is still waiting in the scheduler queue.
   */
  clear(): void {
    // Discard every task that has not yet entered a flush batch.
    this.queue.length = 0;
  }

  /**
   * Returns whether there is pending scheduled work.
   *
   * @returns `true` when at least one task is waiting.
   */
  get hasPendingWork(): boolean {
    return this.queue.length > 0;
  }
  /**
   * Returns whether the scheduler is currently executing a batch.
   *
   * @returns `true` while a flush is actively executing scheduled tasks.
   */
  get isFlushing(): boolean {
    // Expose the scheduler's current execution state without allowing
    // callers to modify the internal flag.
    return this._flushing;
  }

  /**
   * Returns the number of pending tasks.
   *
   * @returns Number of queued tasks.
   */
  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Executes all currently queued tasks in insertion order.
   *
   * Tasks scheduled while flushing are left in the queue for the next
   * flush cycle. This gives us a predictable batching boundary.
   *
   * A scheduler cannot be flushed recursively. A nested flush attempt throws
   * immediately because the current flush already owns the active batch.
   *
   * If a task throws, the scheduler continues executing the remaining
   * tasks in the current batch and rethrows the first error afterwards.
   *
   * @throws {Error} If flush is called while the scheduler is already flushing.
   * @throws {unknown} The first error thrown by a scheduled task.
   */
  flush(): void {
    // Prevent a task from recursively starting another flush cycle.
    if (this._flushing) {
      throw new Error('Reactive scheduler cannot be flushed recursively.');
    }

    // Capture the current batch and leave newly scheduled work for the
    // next flush cycle.
    const batch = this.queue.splice(0, this.queue.length);

    // Mark the scheduler as actively flushing this batch.
    this._flushing = true;

    // Remember the first task error without interrupting the remaining tasks.
    let firstError: unknown;

    try {
      // Execute each task in the order it was scheduled.
      for (const task of batch) {
        try {
          // Run the scheduled unit of work.
          task();
        } catch (error) {
          // Preserve the first error while allowing the remaining tasks
          // in the current batch to continue executing.
          if (firstError === undefined) {
            firstError = error;
          }
        }
      }
    } finally {
      // Always leave the flushing state, even if future implementation
      // changes introduce another unexpected exception path.
      this._flushing = false;
    }

    // Report the first scheduled-task failure after the complete batch
    // has finished executing.
    if (firstError !== undefined) {
      throw firstError;
    }
  }
  /**
   * Executes the next pending task.
   *
   * Unlike {@link flush}, this method executes at most one task. Tasks
   * scheduled by that task remain pending for a later call.
   *
   * @throws {Error} If flushOne is called while the scheduler is already flushing.
   * @throws {unknown} If the scheduled task throws.
   */
  flushOne(): void {
    // Prevent nested execution from bypassing the scheduler's reentrancy guard.
    if (this._flushing) {
      throw new Error('Reactive scheduler cannot be flushed recursively.');
    }

    // Remove the next task from the pending queue.
    const task = this.queue.shift();

    // There is nothing to execute when the queue is empty.
    if (task === undefined) {
      return;
    }

    // Mark the scheduler as actively executing a task.
    this._flushing = true;

    try {
      // Execute exactly one pending task.
      task();
    } finally {
      // Always restore the scheduler to its idle state.
      this._flushing = false;
    }
  }
}
