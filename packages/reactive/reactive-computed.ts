import {ReactiveNode} from './reactive-node.js';
import {ReactiveRuntime} from './reactive-runtime.js';
import {ReactiveLink} from './reactive-link.js';

/**
 * Represents a lazily computed reactive value.
 *
 * A computed value depends on other reactive nodes:
 *
 *     count ───► doubleCount
 *
 * The computed value is evaluated only when it is read and its
 * dependencies may have changed.
 *
 * @typeParam T - The type of value produced by the computation.
 */
export class ReactiveComputed<T> {
  /**
   * Cached result of the computation.
   */
  private _value!: T;

  /**
   * Indicates whether the computation has produced its first value.
   */
  private _initialized = false;

  /**
   * Indicates whether this computed value has been disposed.
   *
   * A disposed computed can no longer participate in the reactive graph.
   */
  private _disposed = false;

  /**
   * Creates a lazy computed reactive value.
   *
   * @param runtime - Runtime that owns the reactive node.
   * @param id - Stable identifier for the reactive node.
   * @param compute - Function used to calculate the current value.
   * @param equals - Optional equality function used to determine whether a
   * computed result actually changed.
   */
  constructor(
    private readonly runtime: ReactiveRuntime,
    id: string,
    private readonly compute: () => T,
    private readonly equals: (previous: T, next: T) => boolean = Object.is,
  ) {
    // Create the reactive node representing this computed value.
    this.node = new ReactiveNode(id, 'computed');
    // Register the computed node so the runtime can track it for scheduling,
    // diagnostics, and graph snapshots.
    this.runtime.registerNode(this.node);
  }

  /**
   * Reactive node representing this computed value.
   */
  public readonly node: ReactiveNode;
  /**
   * Recomputes this computed value when it is invalidated.
   *
   * The method is intentionally safe to call when the value is already
   * up-to-date; in that case no computation occurs.
   *
   * @returns The current computed value.
   * @throws {Error} If the computation attempts to read itself recursively.
   */
  recompute(): T {
    // A disposed computed can no longer be evaluated.
    if (this._disposed) {
      throw new Error(`Reactive computed "${this.node.id}" has been disposed.`);
    }
    // A computed value cannot safely evaluate itself recursively.
    if (this.node.computing) {
      throw new Error(`Reactive computed "${this.node.id}" cannot read itself while computing.`);
    }

    // Return the cached value when it is still valid.
    if (this.isValid()) {
      return this._value as T;
    }

    // Remember which consumer was active before this computation started.
    const previousConsumer = this.runtime.context.activeConsumer;

    // Clear the dependency observations from the previous computation.
    this.node.beginDependencyTracking();

    // Mark this node as actively computing.
    this.node.beginComputation();

    // Make this node the active consumer while its computation executes.
    this.runtime.context.setActiveConsumer(this.node);

    let nextValue: T;

    try {
      // Execute the computation while dependency tracking is active.
      nextValue = this.compute();
    } finally {
      // Always leave the computing state, even when the computation throws.
      this.node.endComputation();

      // Restore the previous reactive consumer.
      if (previousConsumer !== undefined) {
        this.runtime.context.setActiveConsumer(previousConsumer);
      } else {
        this.runtime.context.clearActiveConsumer();
      }
    }

    // Reconcile the dependency graph with the producers actually observed.
    this.node.synchronizeDependencies();

    // Determine whether the computed result actually changed.
    //
    // The custom equality function allows callers to decide when two computed
    // results should be considered equivalent.
    const valueChanged = !this._initialized || !this.equals(this._value, nextValue);

    // Store the newly computed result.
    this._value = nextValue;

    // Only propagate when the computed result actually changed.
    if (valueChanged) {
      // Record the new value and invalidate downstream consumers.
      this.node.markValueChanged();
    }

    // The node now has a valid cached value.
    this._initialized = true;

    // Clear the invalidation state after successful recomputation.
    this.node.clearDirty();

    // Record the producer versions observed by this computation.
    this.node.synchronizeProducerVersions();

    return this._value as T;
  }
  /**
   * Returns the current computed value.
   *
   * @returns The current computed value.
   * @throws {Error} If this computed value has been disposed.
   */
  get value(): T {
    // A disposed computed can no longer be read by reactive computations.
    if (this._disposed) {
      throw new Error(`Reactive computed "${this.node.id}" has been disposed.`);
    }

    // If another computation is currently running, register this computed
    // node as one of that computation's dependencies.
    const consumer = this.runtime.context.activeConsumer;

    if (consumer !== undefined) {
      consumer.trackProducer(this.node);
    }

    // Evaluate only when the cached value is invalid.
    return this.recompute();
  }
  /**
   * Determines whether the cached computed value is currently valid.
   *
   * The value is valid when:
   * - it has been computed at least once,
   * - it is not marked dirty, and
   * - none of its tracked producers has changed since the last computation.
   *
   * @returns `true` when the cached value can be safely reused.
   */
  isValid(): boolean {
    // A computed value that has never been evaluated has no valid cache.
    if (!this._initialized) {
      return false;
    }

    // A dirty node was explicitly invalidated during the push phase.
    if (this.node.dirty) {
      return false;
    }

    // Ask the computed value whether one of its dependencies has changed.
    const changedLink = this.getChangedProducer();

    // The cache is valid only when no dependency has changed.
    return changedLink === undefined;
  }
  /**
   * Returns the dependency link whose producer changed since this computed
   * value was last checked.
   *
   * @returns The first changed producer link, or `undefined` when all
   * dependencies are current.
   */
  getChangedProducer(): ReactiveLink | undefined {
    // An uninitialized computed has no established dependency state yet.
    if (!this._initialized) {
      return undefined;
    }

    // A dirty computed may have a changed dependency that should be inspected.
    if (this.node.dirty) {
      return this.runtime.pollProducersForChange(this.node);
    }

    // Inspect producer versions only when the computed is otherwise clean.
    return this.runtime.pollProducersForChange(this.node);
  }
  /**
   * Disposes this computed value and removes it from the reactive runtime.
   *
   * Disposal is idempotent. Once disposed, the computed can no longer be
   * evaluated or re-enter the reactive graph.
   *
   * Downstream consumers are invalidated before the node is disconnected so
   * they cannot keep serving cached values that depended on this computed.
   */
  dispose(): void {
    // Disposal is intentionally idempotent.
    if (this._disposed) {
      return;
    }

    // Mark the computed as permanently disposed before notifying consumers.
    this._disposed = true;

    // Invalidate downstream consumers while the dependency relationships
    // still exist so they cannot keep trusting their cached values.
    this.node.notifyConsumers();

    // Disconnect the node and unregister it from the runtime.
    this.runtime.disposeNode(this.node);
  }
  /**
   * Indicates whether this computed value has been disposed.
   *
   * @returns `true` when the computed can no longer participate in the
   * reactive graph.
   */
  get disposed(): boolean {
    // Expose the lifecycle state without allowing callers to mutate it.
    return this._disposed;
  }
}
