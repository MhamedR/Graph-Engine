import {ReactiveRuntime} from './reactive-runtime.js';
import {ReactiveNode} from './reactive-node.js';
import {
  ReactiveEffectScheduleHandle,
  ReactiveEffectScheduler,
} from './reactive-scheduler-options.js';
/**
 * Describes the observable lifecycle state of a ReactiveEffect.
 */
export interface EffectState {
  /** Whether the effect has executed successfully at least once. */
  initialized: boolean;

  /** Whether the effect has been permanently destroyed. */
  destroyed: boolean;

  /** Whether the effect is still active. */
  active: boolean;

  /** Whether the effect currently requires execution. */
  dirty: boolean;

  /** Whether the effect currently has scheduled work. */
  scheduled: boolean;

  /** Number of reactive dependencies currently tracked by the effect. */
  dependencyCount: number;
}
/**
 * Represents a reactive side-effect.
 *
 * A ReactiveEffect executes a function while dependency tracking is active.
 * Any reactive values read during the execution become producers of the
 * effect node.
 *
 * Unlike ReactiveComputed, an effect does not cache a return value. Its
 * purpose is to perform work in response to reactive dependencies.
 */
export class ReactiveEffect {
  /**
   * Reactive node representing this effect.
   */
  public readonly node: ReactiveNode;

  private _initialized = false;
  /**
   * Tracks whether this effect already has a scheduled execution waiting.
   *
   * This prevents repeated scheduling from creating duplicate work for the
   * same effect.
   */
  private _scheduled = false;
  /**
   * Tracks whether this effect has been permanently destroyed.
   *
   * A destroyed effect must no longer execute or schedule new work.
   */
  private _destroyed = false;
  /**
   * Handle for cancelling the currently scheduled custom-scheduler task.
   */
  private _scheduleHandle: ReactiveEffectScheduleHandle | undefined;

  /**
   * Scheduler responsible for deciding when this effect executes.
   */
  private readonly scheduler: ReactiveEffectScheduler;

  constructor(
    private readonly runtime: ReactiveRuntime,
    id: string,
    private readonly effect: () => void,
    scheduler?: ReactiveEffectScheduler,
  ) {
    this.scheduler = scheduler ?? runtime.scheduler;
    this.node = new ReactiveNode(id);
    // Register the effect's reactive node with the runtime so the effect
    // participates in runtime-level inspection and diagnostics.
    this.runtime.registerNode(this.node);

    /**
     * Registers the effect's invalidation behavior.
     *
     * Effects invalidated inside a batch defer their scheduling until the
     * outermost batch completes. Outside a batch, scheduling remains immediate.
     */
    this.node.setOnInvalidate(() => {
      // When batching is active, postpone scheduling until the batch finishes.
      if (this.runtime.isBatching) {
        this.runtime.deferUntilBatchComplete(() => {
          // The effect may have been destroyed while the batch was running, so
          // schedule() remains responsible for checking its lifecycle state.
          this.schedule();
        });

        return;
      }

      // Outside a batch, preserve the normal immediate scheduling behavior.
      this.schedule();
    });
  }
  /**
   * Returns whether this effect has been executed at least once.
   *
   * @returns `true` after the first successful execution.
   */
  get initialized(): boolean {
    // Expose whether the effect has established its dependency graph.
    return this._initialized;
  }
  /**
   * Returns whether this effect currently requires execution because one of
   * its dependencies has invalidated it.
   *
   * Destroyed effects are never considered dirty because they no longer
   * participate in the reactive graph.
   *
   * @returns `true` when the active effect is dirty.
   */
  get isDirty(): boolean {
    // A destroyed effect no longer participates in reactive invalidation.
    if (this._destroyed) {
      return false;
    }

    return this.node.dirty;
  }
  /**
   * Returns whether this effect currently has scheduled work pending.
   *
   * @returns `true` when the effect is waiting in the runtime scheduler.
   */
  get isScheduled(): boolean {
    // Expose the internal scheduling state for inspection and testing.
    return this._scheduled;
  }
  /**
   * Returns whether this effect has been destroyed.
   *
   * @returns `true` when the effect can no longer participate in reactive
   * scheduling.
   */
  get destroyed(): boolean {
    // Expose the effect lifecycle state without allowing callers to mutate it.
    return this._destroyed;
  }
  /**
   * Returns the number of reactive dependencies currently tracked by this
   * effect.
   *
   * @returns Number of producer nodes tracked by the effect.
   */
  get dependencyCount(): number {
    // Delegate to the underlying reactive node's producer collection.
    return this.node.producerCount;
  }
  /**
   * Returns the IDs of the reactive nodes currently tracked by this effect.
   *
   * A new array is returned so callers cannot mutate the effect's internal
   * dependency collection.
   *
   * @returns IDs of the current producer nodes.
   */
  get dependencyIds(): string[] {
    // Delegate to the underlying node and return a defensive array.
    return this.node.getProducerIds();
  }
  /**
   * Returns whether this effect is still active.
   *
   * @returns `true` when the effect has not been destroyed.
   */
  get isActive(): boolean {
    // An effect is active exactly when it has not been destroyed.
    return !this._destroyed;
  }
  /**
   * Returns a snapshot of the effect's current lifecycle state.
   *
   * @returns Current effect lifecycle information.
   */
  get state(): EffectState {
    // Build a fresh snapshot so callers cannot mutate internal effect state.
    return {
      initialized: this._initialized,
      destroyed: this._destroyed,
      active: this.isActive,
      dirty: this.isDirty,
      scheduled: this.isScheduled,
      dependencyCount: this.dependencyCount,
    };
  }
  /**
   * Runs the effect immediately.
   *
   * The first execution establishes the effect's dependencies. Subsequent
   * executions rebuild those dependencies so dynamic dependency tracking
   * remains correct.
   *
   * Dependencies are synchronized even when the effect throws so that
   * dependency tracking remains consistent after failed executions.
   *
   * Any pending scheduled execution is cancelled because this explicit run
   * becomes the authoritative execution.
   *
   * @throws {Error} If the effect attempts to execute itself recursively or
   * if the effect function itself throws.
   */
  run(): void {
    // A destroyed effect is no longer allowed to execute.
    if (this._destroyed) {
      return;
    }

    // Prevent recursive execution of the same effect.
    if (this.node.computing) {
      throw new Error(`Reactive effect "${this.node.id}" cannot run itself recursively.`);
    }

    // An explicit run supersedes any previously scheduled execution.
    //
    // Cancel the scheduler task itself before clearing the local scheduling
    // state so the effect cannot execute a second time later.
    this._scheduleHandle?.cancel();
    this._scheduleHandle = undefined;
    this._scheduled = false;

    // Remember the consumer that was active before this effect started.
    const previousConsumer = this.runtime.context.activeConsumer;

    // Start collecting dependencies for this execution.
    this.node.beginDependencyTracking();

    // Mark this effect as actively executing.
    this.node.beginComputation();

    // Make this effect the active consumer while its function executes.
    this.runtime.context.setActiveConsumer(this.node);

    try {
      // Execute the side effect while dependency tracking is active.
      this.effect();
    } finally {
      // Always leave the computing state after execution.
      this.node.endComputation();

      // Restore the previous reactive consumer.
      if (previousConsumer !== undefined) {
        this.runtime.context.setActiveConsumer(previousConsumer);
      } else {
        this.runtime.context.clearActiveConsumer();
      }

      // Synchronize dependencies even when the effect throws.
      //
      // This preserves the dependency graph observed before the failure
      // propagated to the caller.
      this.node.synchronizeDependencies();
    }

    // The effect has now established its current dependency state.
    this._initialized = true;

    // An explicit run leaves the effect clean.
    this.node.clearDirty();

    // Record the producer versions observed by this execution.
    this.node.synchronizeProducerVersions();
  }
  /**
   * Determines whether the effect currently needs execution.
   *
   * An effect needs to run when it has never established its dependency graph
   * or when one of its tracked dependencies has invalidated it. A destroyed
   * effect never needs execution.
   *
   * @returns `true` when the active effect requires execution.
   */
  shouldRun(): boolean {
    // A destroyed effect can never require another execution.
    if (this._destroyed) {
      return false;
    }

    if (!this._initialized) {
      return true;
    }

    return this.node.dirty;
  }
  /**
   * Schedules the effect for execution.
   *
   * The configured scheduler decides when the effect actually runs.
   *
   * @throws Re-throws an error if the configured scheduler rejects the task.
   */
  public schedule(): void {
    if (this._destroyed || this._scheduled) {
      return;
    }

    this._scheduled = true;

    try {
      this._scheduleHandle = this.scheduler.schedule(() => {
        this._scheduled = false;
        this._scheduleHandle = undefined;

        if (this._destroyed) {
          return;
        }

        if (this.shouldRun()) {
          this.run();
        }
      });
    } catch (error) {
      // Restore the scheduling state when the scheduler itself fails.
      this._scheduled = false;
      this._scheduleHandle = undefined;
      throw error;
    }
  }
  /**
   * Disposes this effect.
   *
   * This is an alias for {@link destroy} and exists so callers can use the
   * common "dispose" terminology for lifecycle cleanup.
   */
  dispose(): void {
    // Reuse the existing destruction implementation so lifecycle cleanup has
    // exactly one source of truth.
    this.destroy();
  }
  /**
   * Removes every dependency currently tracked by this effect.
   *
   * The reactive node owns the graph-level cleanup operation, so the effect
   * only needs to delegate the lifecycle cleanup to that primitive.
   */
  private cleanupDependencies(): void {
    // Let the reactive node remove every producer relationship and keep both
    // sides of the dependency graph synchronized.
    this.node.clearProducers();
  }
  /**
   * Destroys the effect and disconnects it from the reactive graph.
   */
  destroy(): void {
    // Destruction is intentionally idempotent.
    if (this._destroyed) {
      return;
    }

    // Mark the effect as destroyed before cancelling work.
    this._destroyed = true;

    // Cancel custom-scheduler work that has not started yet.
    this._scheduleHandle?.cancel();

    // Forget the completed cancellation handle.
    this._scheduleHandle = undefined;

    // Clear the local scheduling state.
    this._scheduled = false;

    // Disconnect the effect from the runtime.
    this.runtime.disposeNode(this.node);
  }
}
