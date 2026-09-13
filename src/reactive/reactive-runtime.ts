import {Epoch} from './epoch.js';
import {ReactiveNode} from './reactive-node.js';
import {ReactiveContext} from './reactive-context.js';
import {ReactiveLink} from './reactive-link.js';
import {ReactiveScheduler} from './scheduler.js';

/**
 * Describes the observable diagnostic state of the reactive runtime.
 */
export interface ReactiveRuntimeState {
  /** Current global reactive epoch. */
  epoch: number;

  /** ID of the currently active consumer, if one exists. */
  activeConsumerId: string | undefined;

  /** Number of tasks waiting in the scheduler. */
  pendingTaskCount: number;

  /** Whether the scheduler currently has pending work. */
  hasPendingWork: boolean;

  /** Whether the scheduler is currently flushing a batch. */
  isFlushing: boolean;
  /** Number of reactive nodes with deferred change work. */
  pendingChangeCount: number;
}
/**
 * Coordinates global state for the reactive system.
 *
 * The runtime owns the global reactive epoch. When a node changes, the
 * runtime advances the epoch and notifies downstream consumers.
 *
 * Keeping this coordination outside ReactiveNode will become useful later
 * when we introduce scheduling, batching, and other runtime behavior.
 */
export class ReactiveRuntime {
  /**
   * Global epoch shared by all reactive nodes managed by this runtime.
   */
  public readonly epoch = new Epoch();
  /**
   * Tracks which reactive computation is currently being evaluated.
   */
  public readonly context = new ReactiveContext();
  /**
   * Tracks nodes that already have a deferred change waiting in the scheduler.
   *
   * This prevents multiple scheduled change tasks for the same node from
   * accumulating within one scheduler batch.
   */
  private readonly pendingChanges = new Set<ReactiveNode>();
  /**
   * Stores reactive nodes known to this runtime.
   *
   * The runtime keeps object references rather than IDs so diagnostic
   * operations can inspect the actual graph relationships.
   */
  private readonly nodes = new Set<ReactiveNode>();
  /**
   * Tracks whether this runtime has been permanently disposed.
   *
   * A disposed runtime should eventually reject or ignore new reactive work.
   */
  private _disposed = false;
  public readonly scheduler = new ReactiveScheduler();
  /**
   * Registers a reactive node with this runtime.
   *
   * Registering the same node more than once is harmless because the runtime
   * stores nodes in a Set.
   *
   * @param node - Reactive node to register.
   * @throws {Error} If this runtime has already been disposed.
   */
  registerNode(node: ReactiveNode): void {
    // A disposed runtime is permanently closed and cannot accept new nodes.
    if (this._disposed) {
      throw new Error('Cannot register a node with a disposed runtime.');
    }

    // Set semantics automatically prevent duplicate registrations.
    this.nodes.add(node);
  }
  /**
   * Removes a reactive node from this runtime's diagnostic registry.
   *
   * Removing a node from the registry does not modify its graph relationships.
   *
   * @param node - Reactive node to unregister.
   */
  unregisterNode(node: ReactiveNode): void {
    // Remove only the runtime's registry entry; graph cleanup remains a
    // separate lifecycle operation.
    this.nodes.delete(node);
  }
  /**
   * Returns all reactive nodes currently registered with the runtime.
   *
   * A new array is returned so callers cannot mutate the internal registry.
   *
   * @returns Registered reactive nodes.
   */
  getNodes(): ReactiveNode[] {
    // Return a defensive copy of the runtime's node registry.
    return [...this.nodes];
  }
  /**
   * Returns the number of reactive nodes registered with the runtime.
   *
   * @returns Number of registered nodes.
   */
  get nodeCount(): number {
    // Expose registry size without exposing the Set itself.
    return this.nodes.size;
  }
  /**
   * Marks a reactive node as changed immediately.
   *
   * The runtime advances the global epoch, updates the node's value version,
   * and propagates invalidation to downstream consumers.
   *
   * @param node - Reactive node whose value changed.
   * @returns The new epoch and the IDs of newly invalidated consumers.
   * @throws {Error} If this runtime has already been disposed.
   */
  markChanged(node: ReactiveNode): {
    epoch: number;
    invalidatedConsumers: string[];
  } {
    // A disposed runtime must not mutate reactive state.
    if (this._disposed) {
      throw new Error('Cannot mark a node as changed on a disposed runtime.');
    }

    // Advance the global reactive epoch before propagating the change.
    const epoch = this.epoch.increment();

    // Update the node's value version and propagate invalidation.
    const invalidatedConsumers = node.markValueChanged();

    return {
      epoch,
      invalidatedConsumers,
    };
  }
  /**
   * Checks whether a reactive node has a producer that changed since the
   * node was last checked.
   *
   * @param node - The reactive node whose dependencies should be checked.
   * @returns The first changed dependency link, or `undefined` when all
   * producers are current.
   */
  pollProducersForChange(node: ReactiveNode): ReactiveLink | undefined {
    // Return the detailed dependency result from the node.
    return node.pollProducersForChange(this.epoch.value);
  }
  /**
   * Schedules a task for later execution.
   *
   * @param task - Work that should be executed during a scheduler flush.
   * @throws {Error} If this runtime has already been disposed.
   */
  schedule(task: () => void): void {
    // A disposed runtime cannot accept new asynchronous work.
    if (this._disposed) {
      throw new Error('Cannot schedule work on a disposed runtime.');
    }

    // Delegate scheduling to the runtime's scheduler.
    this.scheduler.schedule(task);
  }
  /**
   * Executes the currently pending scheduled work.
   *
   * The runtime delegates execution to its scheduler while keeping the
   * scheduler implementation hidden from runtime consumers.
   *
   * @throws {Error} If the scheduler is already flushing.
   * @throws {unknown} If scheduled work throws.
   */
  flush(): void {
    // Delegate execution to the runtime-owned scheduler.
    this.scheduler.flush();
  }
  /**
   * Returns whether the runtime has scheduled work waiting to execute.
   *
   * @returns `true` when at least one scheduled task is pending.
   */
  get hasPendingWork(): boolean {
    // Expose the scheduler's pending state through the runtime API.
    return this.scheduler.hasPendingWork;
  }
  /**
   * Returns a snapshot of the runtime's current diagnostic state.
   *
   * A fresh object is returned so callers cannot mutate runtime state through
   * the diagnostic snapshot.
   *
   * @returns Current reactive runtime state.
   */
  get state(): ReactiveRuntimeState {
    // Capture the current global runtime state without exposing mutable
    // scheduler or context internals.
    return {
      epoch: this.epoch.value,
      activeConsumerId: this.context.activeConsumer?.id,
      pendingTaskCount: this.scheduler.pendingCount,
      hasPendingWork: this.scheduler.hasPendingWork,
      isFlushing: this.scheduler.isFlushing,
      pendingChangeCount: this.pendingChangeCount,
    };
  }
  /**
   * Returns the number of reactive nodes that currently have a deferred
   * change waiting in the scheduler.
   *
   * @returns Number of nodes with pending reactive changes.
   */
  get pendingChangeCount(): number {
    // Expose the coalescing set size without exposing the set itself.
    return this.pendingChanges.size;
  }
  /**
   * Returns whether this runtime has been permanently disposed.
   *
   * @returns `true` when the runtime has been disposed.
   */
  get disposed(): boolean {
    // Expose the runtime lifecycle state without allowing external mutation.
    return this._disposed;
  }
  /**
   * Schedules a reactive value change for a later scheduler flush.
   *
   * Multiple calls for the same node are coalesced while its change is
   * already waiting in the scheduler.
   *
   * @param node - The reactive node whose value should be marked as changed.
   * @throws {Error} If this runtime has already been disposed.
   */
  scheduleChange(node: ReactiveNode): void {
    // A disposed runtime is permanently closed and cannot accept new work.
    if (this._disposed) {
      throw new Error('Cannot schedule work on a disposed runtime.');
    }

    // Avoid creating duplicate change work for the same node.
    if (this.pendingChanges.has(node)) {
      return;
    }

    // Remember that this node already has pending change work.
    this.pendingChanges.add(node);

    try {
      // Defer the actual reactive change until the scheduler is flushed.
      this.schedule(() => {
        // Remove the node from the pending set before applying the change.
        this.pendingChanges.delete(node);

        // Apply the normal reactive change semantics.
        this.markChanged(node);
      });
    } catch (error) {
      // Roll back the coalescing state if scheduling itself fails.
      this.pendingChanges.delete(node);

      throw error;
    }
  }
  /**
   * Cancels all currently scheduled runtime work.
   *
   * This clears both the scheduler queue and the runtime's pending-change
   * bookkeeping so future changes can be scheduled normally.
   */
  clearScheduledWork(): void {
    // Remove all queued scheduler tasks.
    this.scheduler.clear();

    // Reset runtime bookkeeping for deferred reactive changes.
    this.pendingChanges.clear();
  }
  /**
   * Executes at most one pending scheduled task.
   *
   * This provides a fine-grained scheduling boundary while keeping the
   * scheduler implementation behind the runtime API.
   *
   * @throws {Error} If the scheduler is already flushing.
   * @throws {unknown} If the scheduled task throws.
   */
  flushOne(): void {
    // Delegate execution of one task to the runtime-owned scheduler.
    this.scheduler.flushOne();
  }
  /**
   * Verifies the consistency of a collection of reactive nodes.
   *
   * Every node is checked from both sides of its dependency relationships.
   * This is intended for debugging and tests rather than hot-path execution.
   *
   * @param nodes - Reactive nodes that should be validated.
   * @returns `true` when every supplied node has consistent relationships.
   */
  validateNodes(nodes: ReactiveNode[]): boolean {
    // Check each node independently so callers can validate an entire
    // reactive graph without exposing the internal node collections.
    for (const node of nodes) {
      if (!node.hasConsistentRelationships()) {
        return false;
      }
    }

    return true;
  }
  /**
   * Removes a reactive node from the runtime and disconnects it from the
   * dependency graph.
   *
   * Disposal is idempotent. Calling this method multiple times is harmless.
   *
   * @param node - Reactive node to remove and isolate.
   */
  disposeNode(node: ReactiveNode): void {
    // Remove every producer and consumer relationship before forgetting the
    // node from the runtime registry.
    node.clearDependencies();

    // Remove the node from runtime-level inspection.
    this.unregisterNode(node);
  }
  /**
   * Disposes every reactive node registered with this runtime.
   *
   * Disposal isolates all registered nodes from the dependency graph and then
   * clears the runtime registry.
   *
   * This is intended for shutting down an entire reactive runtime.
   */
  dispose(): void {
    // Copy the registry before disposal because each node is removed from the
    // runtime registry during disposeNode().
    const nodes = [...this.nodes];

    // Dispose every currently registered node.
    for (const node of nodes) {
      this.disposeNode(node);
    }

    // Clear any scheduler work that may still be waiting.
    this.clearScheduledWork();
    // Mark the runtime as permanently disposed after all cleanup has completed.
    this._disposed = true;
  }
}
