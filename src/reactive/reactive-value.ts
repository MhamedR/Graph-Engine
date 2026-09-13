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
   * Creates a reactive value.
   *
   * @param runtime - Runtime responsible for coordinating reactive changes.
   * @param id - Unique identifier for the underlying reactive node.
   * @param initialValue - Initial value stored by this reactive value.
   */
  constructor(
    private readonly runtime: ReactiveRuntime,
    id: string,
    initialValue: T,
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
   * Updates the stored value and notifies the reactive runtime.
   *
   * @param value - The new value to store.
   */
  set value(value: T) {
    // Store the new value.
    this._value = value;

    // Tell the runtime that this reactive value changed.
    this.runtime.markChanged(this.node);
  }
}
