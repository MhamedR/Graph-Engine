import {Epoch} from './epoch.js';
import {ReactiveNode} from './reactive-node.js';
import {ReactiveContext} from './reactive-context.js';
import {ReactiveLink} from './reactive-link.js';
import {ReactiveScheduler} from './scheduler.js';
import {
  ReactiveGraphSnapshot,
  ReactiveGraphSnapshotEdge,
  ReactiveGraphSnapshotNode,
} from './reactive-graph-snapshot.js';

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

  /** Whether the runtime is currently inside a batch. */
  isBatching: boolean;

  /** Current batch nesting depth. */
  batchDepth: number;

  /** Number of distinct nodes changed during the active batch. */
  batchedChangeCount: number;

  /** Number of tasks waiting for the current batch to complete. */
  deferredBatchTaskCount: number;
}
/**
 * Describes aggregate metrics for the current reactive graph.
 */
export interface ReactiveGraphMetrics {
  /** Number of registered reactive nodes. */
  readonly nodeCount: number;

  /** Number of dependency relationships between registered nodes. */
  readonly edgeCount: number;

  /** Number of currently dirty nodes. */
  readonly dirtyNodeCount: number;

  /** Number of currently computing nodes. */
  readonly computingNodeCount: number;

  /** Maximum number of direct producers attached to one node. */
  readonly maxProducerCount: number;

  /** Maximum number of direct consumers attached to one node. */
  readonly maxConsumerCount: number;
}
/**
 * Describes the complete diagnostic state of a reactive runtime.
 */
export interface ReactiveRuntimeInspection {
  /** Current runtime lifecycle and scheduler state. */
  readonly runtime: ReactiveRuntimeState;

  /** Aggregate metrics for the registered reactive graph. */
  readonly metrics: ReactiveGraphMetrics;

  /** Detached snapshot of the current reactive graph. */
  readonly graph: ReactiveGraphSnapshot;

  /** Detailed diagnostic state for every registered node. */
  readonly nodes: readonly ReactiveNodeInspection[];
}
/**
 * Describes the diagnostic state of one registered reactive node.
 */
export interface ReactiveNodeInspection {
  /** Unique identifier of the reactive node. */
  readonly id: string;

  /** Current node version. */
  readonly version: number;

  /** Whether the node is currently dirty. */
  readonly dirty: boolean;

  /** Whether the node is currently computing. */
  readonly computing: boolean;

  /** IDs of the node's direct producers. */
  readonly producerIds: readonly string[];

  /** IDs of the node's direct consumers. */
  readonly consumerIds: readonly string[];
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
   * Tracks whether the runtime is currently inside a reactive batch.
   *
   * Batching allows multiple state changes to be grouped into one logical
   * reactive update.
   */
  private _batchDepth = 0;
  /**
   * Stores nodes whose values changed during the current batch.
   *
   * A Set ensures that multiple changes to the same node are coalesced into
   * one batch-level record.
   */
  private readonly batchedChanges = new Set<ReactiveNode>();
  /**
   * Stores work that must wait until the current outermost batch completes.
   *
   * A Set prevents the same callback reference from being queued more than
   * once during a batch.
   */
  private readonly afterBatchTasks = new Set<() => void>();
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
   * Returns the number of distinct reactive nodes changed during the current
   * batch.
   *
   * @returns Number of nodes recorded in the active batch.
   */
  get batchedChangeCount(): number {
    // The Set automatically coalesces repeated changes to the same node.
    return this.batchedChanges.size;
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
    // Record the changed node when inside a batch so the outer batch can later
    // coordinate its pending reactive work.
    if (this.isBatching) {
      this.batchedChanges.add(node);
    }

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
      batchedChangeCount: this.batchedChangeCount,
      isBatching: this.isBatching,
      batchDepth: this.batchDepth,
      deferredBatchTaskCount: this.deferredBatchTaskCount,
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
   * Returns whether the runtime is currently executing inside a batch.
   *
   * @returns `true` when at least one batch is active.
   */
  get isBatching(): boolean {
    // A positive depth means one or more nested batches are active.
    return this._batchDepth > 0;
  }
  /**
   * Returns the current batch nesting depth.
   *
   * @returns Number of active nested batches.
   */
  get batchDepth(): number {
    // Expose the nesting depth for diagnostics without allowing mutation.
    return this._batchDepth;
  }
  /**
   * Returns the number of tasks waiting for the current outermost batch to
   * complete.
   *
   * @returns Number of deferred batch tasks.
   */
  get deferredBatchTaskCount(): number {
    // Expose the deferred-task collection size without exposing the collection.
    return this.afterBatchTasks.size;
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
   * Disposal isolates all registered nodes and clears every form of pending
   * runtime work.
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

    // Clear scheduler work that is still waiting to execute.
    this.clearScheduledWork();

    // Clear deferred work waiting for an active batch to complete.
    this.afterBatchTasks.clear();

    // Clear temporary batch-change bookkeeping.
    this.batchedChanges.clear();

    // Reset the batch depth as part of shutting down the runtime.
    this._batchDepth = 0;

    // Mark the runtime as permanently disposed after all cleanup has completed.
    this._disposed = true;
  }
  /**
   * Executes a function inside a reactive batch.
   *
   * Batches may be nested. The runtime remains in batching mode until the
   * outermost batch completes.
   *
   * @param callback - Work to execute inside the batch.
   * @throws {Error} If this runtime has already been disposed.
   * @throws {unknown} Any error thrown by the callback.
   */
  batch<T>(callback: () => T): T {
    // A disposed runtime cannot execute new reactive work.
    if (this._disposed) {
      throw new Error('Cannot batch work on a disposed runtime.');
    }

    // Enter the next batch nesting level.
    this._batchDepth++;

    try {
      // Execute the caller's work while batching is active.
      return callback();
    } finally {
      // Leave the current batch level even when the callback throws.
      this._batchDepth--;

      // Only the outermost batch owns the complete batch lifecycle.
      if (this._batchDepth === 0) {
        // Capture deferred work before clearing the collection so tasks can
        // safely schedule additional work if necessary.
        const tasks = [...this.afterBatchTasks];

        // Clear the current batch's temporary state.
        this.afterBatchTasks.clear();
        this.batchedChanges.clear();

        // Execute work that was deferred until batching completed.
        for (const task of tasks) {
          task();
        }
      }
    }
  }
  /**
   * Defers work until the current outermost batch completes.
   *
   * @param task - Work that should execute after batching ends.
   * @throws {Error} If this runtime has already been disposed.
   */
  deferUntilBatchComplete(task: () => void): void {
    // A disposed runtime cannot accept new deferred work.
    if (this._disposed) {
      throw new Error('Cannot defer work on a disposed runtime.');
    }

    // Store the task until the outermost batch completes.
    this.afterBatchTasks.add(task);
  }
  /**
   * Creates a diagnostic snapshot of every reactive node currently registered
   * with this runtime.
   *
   * The snapshot contains node state and every producer-to-consumer dependency
   * relationship.
   *
   * @returns A detached snapshot of the current reactive graph.
   */
  createGraphSnapshot(): ReactiveGraphSnapshot {
    // Capture node state without exposing the actual ReactiveNode objects.
    const nodes: ReactiveGraphSnapshotNode[] = this.getNodes().map((node) => ({
      id: node.id,
      version: node.version,
      dirty: node.dirty,
      computing: node.computing,
      producerCount: node.producerCount,
      consumerCount: node.consumerCount,
    }));

    // Collect every dependency relationship from the registered nodes.
    const edges: ReactiveGraphSnapshotEdge[] = [];

    /**
     * Collects every dependency relationship from the registered nodes.
     */
    for (const node of this.getNodes()) {
      // Use the public producer-link API rather than reaching into ReactiveNode's
      // private dependency storage.
      for (const link of node.getProducerLinks()) {
        edges.push({
          producerId: link.producer.id,
          consumerId: link.consumer.id,
          version: link.version,
          stale: link.hasChanged(),
        });
      }
    }

    return {
      nodes,
      edges,
    };
  }
  /**
   * Calculates aggregate metrics for the currently registered reactive graph.
   *
   * @returns Current graph size, dependency, state, and fan-out metrics.
   */
  getGraphMetrics(): ReactiveGraphMetrics {
    const nodes = this.getNodes();

    let edgeCount = 0;
    let dirtyNodeCount = 0;
    let computingNodeCount = 0;
    let maxProducerCount = 0;
    let maxConsumerCount = 0;

    for (const node of nodes) {
      // Count each producer relationship exactly once.
      edgeCount += node.producerCount;

      // Track current node state.
      if (node.dirty) {
        dirtyNodeCount++;
      }

      if (node.computing) {
        computingNodeCount++;
      }

      // Track the largest direct dependency fan-in and fan-out.
      maxProducerCount = Math.max(maxProducerCount, node.producerCount);
      maxConsumerCount = Math.max(maxConsumerCount, node.consumerCount);
    }

    return {
      nodeCount: nodes.length,
      edgeCount,
      dirtyNodeCount,
      computingNodeCount,
      maxProducerCount,
      maxConsumerCount,
    };
  }
  /**
   * Creates a complete diagnostic view of the current reactive runtime.
   *
   * The inspection combines runtime lifecycle state, aggregate graph metrics,
   * a detached graph snapshot, and detailed state for every registered node.
   *
   * @returns Complete diagnostic information for the current runtime.
   */
  inspect(): ReactiveRuntimeInspection {
    // Capture the runtime's current scheduler and lifecycle state.
    const runtime = this.state;

    // Calculate aggregate statistics for the registered reactive graph.
    const metrics = this.getGraphMetrics();

    // Capture the current dependency graph without exposing live graph objects.
    const graph = this.createGraphSnapshot();

    // Capture detailed information for every registered node.
    const nodes: ReactiveNodeInspection[] = this.getNodes().map((node) => ({
      id: node.id,
      version: node.version,
      dirty: node.dirty,
      computing: node.computing,
      producerIds: node.getProducerIds(),
      consumerIds: node.getConsumerIds(),
    }));

    return {
      runtime,
      metrics,
      graph,
      nodes,
    };
  }
  /**
   * Creates a human-readable diagnostic report for the current runtime.
   *
   * The report is intended for terminal debugging and logging rather than
   * machine-readable processing.
   *
   * @returns Multi-line diagnostic report describing the runtime and graph.
   */
  describe(): string {
    // Build the complete diagnostic state once so every section represents
    // the same logical inspection.
    const inspection = this.inspect();

    const lines: string[] = [];

    lines.push('Reactive Runtime');
    lines.push('================');
    lines.push(`Epoch: ${inspection.runtime.epoch}`);
    lines.push(`Nodes: ${inspection.metrics.nodeCount}`);
    lines.push(`Edges: ${inspection.metrics.edgeCount}`);
    lines.push(`Dirty nodes: ${inspection.metrics.dirtyNodeCount}`);
    lines.push(`Computing nodes: ${inspection.metrics.computingNodeCount}`);
    lines.push(`Pending tasks: ${inspection.runtime.pendingTaskCount}`);
    lines.push(`Batching: ${inspection.runtime.isBatching}`);
    lines.push('');
    lines.push('Nodes');
    lines.push('-----');

    // Add one compact diagnostic line for every registered node.
    for (const node of inspection.nodes) {
      lines.push(
        `${node.id} ` +
          `(version=${node.version}, ` +
          `dirty=${node.dirty}, ` +
          `computing=${node.computing}, ` +
          `producers=[${node.producerIds.join(', ')}], ` +
          `consumers=[${node.consumerIds.join(', ')}])`,
      );
    }

    return lines.join('\n');
  }
}
