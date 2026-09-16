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
   * Indicates whether this reactive value has been disposed.
   *
   * A disposed value can no longer participate in the reactive graph or
   * accept updates.
   */
  private _disposed = false;
  /**
   * Indicates whether this reactive value has been disposed.
   *
   * @returns `true` when this value can no longer be mutated or participate
   * in the reactive graph.
   */
  get disposed(): boolean {
    // Expose lifecycle state without allowing callers to mutate it.
    return this._disposed;
  }
  /**
   * Returns the current stored value.
   *
   * @returns The current reactive value.
   * @throws {Error} If this reactive value has been disposed.
   */
  get value(): T {
    // A disposed value can no longer be read by reactive computations.
    if (this._disposed) {
      throw new Error(`Reactive value "${this.node.id}" has been disposed.`);
    }

    // Register this value as a dependency of the currently active consumer.
    const consumer = this.runtime.context.activeConsumer;

    if (consumer !== undefined) {
      consumer.trackProducer(this.node);
    }

    // Return the current stored value.
    return this._value;
  }
  /**
   * Updates the stored value and notifies the reactive graph when the value
   * actually changed.
   *
   * @param value - New value to store.
   * @throws {Error} If this reactive value has been disposed.
   */
  set value(value: T) {
    // A disposed value can no longer be mutated.
    if (this._disposed) {
      throw new Error(`Reactive value "${this.node.id}" has been disposed.`);
    }

    // Avoid invalidating the graph when the value did not actually change.
    if (this.equals(this._value, value)) {
      return;
    }

    // Store the new value.
    this._value = value;

    // Notify the reactive graph that the value changed.
    this.runtime.markChanged(this.node);
  }
  /**
   * Disposes this reactive value and removes it from the reactive runtime.
   *
   * Disposal is idempotent. Once disposed, the value can no longer be
   * mutated or participate in the reactive graph.
   */
  dispose(): void {
    // Disposal is intentionally idempotent.
    if (this._disposed) {
      return;
    }

    // Mark the value as permanently disposed before notifying consumers.
    this._disposed = true;

    // Invalidate downstream consumers while the dependency relationships
    // still exist so they cannot keep trusting their cached values.
    this.node.notifyConsumers();

    // Disconnect the node and unregister it from the runtime.
    this.runtime.disposeNode(this.node);
  }
}
