/**
 * Represents a scheduled reactive effect task.
 *
 * The returned handle allows the owner of the effect to cancel work that
 * has not started yet.
 */
export interface ReactiveEffectScheduleHandle {
  /**
   * Cancels the scheduled task.
   *
   * Cancellation is idempotent.
   */
  cancel(): void;
}

/**
 * Describes the scheduling policy used by a reactive effect.
 *
 * The scheduler receives a callback representing the effect execution and
 * decides when that callback should be executed.
 */
export interface ReactiveEffectScheduler {
  /**
   * Schedules one effect execution.
   *
   * @param task - Effect execution that should eventually run.
   * @returns Handle that can cancel the pending task.
   */
  schedule(task: () => void): ReactiveEffectScheduleHandle;
}
