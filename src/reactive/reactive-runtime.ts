import {Epoch} from './epoch.js';
import {ReactiveNode} from './reactive-node.js';
import {ReactiveContext} from './reactive-context.js';
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
   * Marks a reactive node as changed.
   *
   * A change advances the global epoch exactly once, then updates the node's
   * local version and propagates dirty state.
   *
   * @param node - The reactive node whose value changed.
   * @returns The new global epoch.
   */
  markChanged(node: ReactiveNode): number {
    // Advance the global epoch exactly once for this change.
    const epoch = this.epoch.increment();

    // Update the node after the epoch has advanced.
    node.markChangedFromRuntime();

    // Return the epoch assigned to this change.
    return epoch;
  }
  /**
   * Checks whether a reactive node has a producer that changed since the
   * node was last checked.
   *
   * The runtime supplies the current global epoch so callers do not need to
   * manage epoch values themselves.
   *
   * @param node - The reactive node whose dependencies should be checked.
   * @returns `true` when at least one producer has changed.
   */
  pollProducersForChange(node: ReactiveNode): boolean {
    // Use the runtime's current epoch for the dependency check.
    return node.pollProducersForChange(this.epoch.value);
  }
}
