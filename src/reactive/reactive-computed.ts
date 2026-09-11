import {ReactiveNode} from './reactive-node.js';
import {ReactiveRuntime} from './reactive-runtime.js';

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
   * Creates a computed reactive value.
   *
   * @param runtime - Runtime responsible for checking reactive changes.
   * @param id - Unique identifier for this computed node.
   * @param compute - Function that produces the computed value.
   * @param producers - Reactive nodes this computation depends on.
   */
  constructor(
    private readonly runtime: ReactiveRuntime,
    id: string,
    private readonly compute: () => T,
  ) {
    // Create the reactive node representing this computed value.
    this.node = new ReactiveNode(id);
  }

  /**
   * Reactive node representing this computed value.
   */
  public readonly node: ReactiveNode;

  /**
   * Returns the current computed value.
   *
   * The computation runs the first time the value is requested and again
   * whenever the runtime detects that one of its producers changed.
   *
   * @returns The current computed value.
   */
  get value(): T {
    // A computed value cannot safely evaluate itself recursively.
    if (this.node.computing) {
      throw new Error(`Reactive computed "${this.node.id}" cannot read itself while computing.`);
    }

    // If another computation is currently evaluating, this computed node
    // becomes one of that computation's dependencies.
    const consumer = this.runtime.context.activeConsumer;

    if (consumer !== undefined) {
      consumer.trackProducer(this.node);
    }

    /**
     * Determines whether this computed value needs to be evaluated.
     *
     * A computed value must evaluate when:
     * - it has never been initialized,
     * - it was explicitly marked dirty by an upstream change, or
     * - one of its producers has a newer version.
     */
    const needsInitialComputation = !this._initialized;

    /**
     * A dirty node was invalidated through the push phase of the reactive
     * graph and therefore must refresh its cached value.
     */
    const isDirty = this.node.dirty;

    /**
     * If the node is not already known to be dirty, inspect its producer
     * versions during the pull phase.
     */
    const hasChangedProducer =
      this._initialized && !isDirty && this.runtime.pollProducersForChange(this.node);

    if (needsInitialComputation || isDirty || hasChangedProducer) {
      // Remember which consumer was active before this computation started.
      const previousConsumer = this.runtime.context.activeConsumer;

      // Mark the node as actively computing before executing its function.
      this.node.beginComputation();

      // Clear the previous run's temporary dependency observations.
      this.node.beginDependencyTracking();

      // Make this computed node the consumer of any reactive values read
      // during the computation.
      this.runtime.context.setActiveConsumer(this.node);

      let nextValue: T;

      try {
        // Execute the computation while dependency tracking is active.
        nextValue = this.compute();
      } finally {
        // The computation has finished, so leave the computing state.
        this.node.endComputation();
        // Restore the previous consumer even if the computation throws.
        if (previousConsumer !== undefined) {
          this.runtime.context.setActiveConsumer(previousConsumer);
        } else {
          this.runtime.context.clearActiveConsumer();
        }
      }

      // Reconcile the dependency graph with the producers actually read.
      this.node.synchronizeDependencies();

      // A computed node should only advance its version when its value
      // actually changes.
      const valueChanged = !this._initialized || !Object.is(this._value, nextValue);

      // Store the newly computed value.
      this._value = nextValue;

      // Mark the computed node as changed only when its value changed.
      if (valueChanged) {
        this.node.markChangedFromRuntime();
      }

      // Remember that the computation now has a valid cached result.
      this._initialized = true;

      // Record the current producer versions as observed.
      this.node.markCleanState();
    }

    // `_initialized` guarantees that `_value` has been assigned here.
    return this._value as T;
  }
}
