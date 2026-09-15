import {ReactiveNode} from './reactive-node.js';
import {ReactiveRuntime} from './reactive-runtime.js';

/**
 * Represents a mutable reactive value.
 *
 * A ReactiveValue combines an ordinary JavaScript value with a
 * ReactiveNode. Updating the value notifies the reactive runtime so
 * dependent nodes can detect the change.
 *
 * @typeParam T - The type of value stored by this reactive value.
 */
export class ReactiveValue<T> {
  private _value: T;

  /**
   * Reactive node representing this value in the dependency graph.
   */
  public readonly node: ReactiveNode;
  /**
   * Creates a writable reactive value.
   *
   * @param runtime - Runtime that owns the reactive node.
   * @param id - Stable identifier for the reactive node.
   * @param initialValue - Initial stored value.
   * @param equals - Optional equality function used to decide whether an
   * update represents a real change.
   */
  constructor(
    private readonly runtime: ReactiveRuntime,
    id: string,
    initialValue: T,
    private readonly equals: (previous: T, next: T) => boolean = Object.is,
  ) {
    this.node = new ReactiveNode(id);

    // Register the value's reactive node with the runtime so it becomes
    // available to runtime-level inspection and diagnostics.
    this.runtime.registerNode(this.node);

    // Store the initial application value separately from the reactive node.
    this._value = initialValue;
  }
  /**
   * Returns the current value.
   *
   * When a reactive computation is currently running, reading this value
   * automatically records a dependency from the active consumer to this
   * reactive value.
   *
   * @returns The current stored value.
   */
  get value(): T {
    // Find the reactive computation currently being evaluated.
    const consumer = this.runtime.context.activeConsumer;

    // If a computation is active, record this producer in the dependencies
    // observed during the current computation.
    if (consumer !== undefined) {
      consumer.trackProducer(this.node);
    }

    // Return the stored value.
    return this._value;
  }

  /**
   * Updates the stored value and notifies the reactive graph when the value
   * actually changed.
   *
   * `Object.is` matches the equality semantics commonly used by reactive
   * systems and correctly handles edge cases such as `NaN` and `-0`.
   *
   * @param value - New value to store.
   */
  set value(value: T) {
    // Avoid invalidating the graph when the value did not actually change.
    if (this.equals(this._value, value)) {
      return;
    }

    this._value = value;
    this.runtime.markChanged(this.node);
  }
}
