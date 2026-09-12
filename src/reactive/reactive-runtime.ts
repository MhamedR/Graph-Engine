import {Epoch} from './epoch.js';
import {ReactiveNode} from './reactive-node.js';
import {ReactiveContext} from './reactive-context.js';
import {ReactiveLink} from './reactive-link.js';
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
   * local version and propagates invalidation.
   *
   * @param node - The reactive node whose value changed.
   * @returns The new global epoch and the consumers that became invalid.
   */
  markChanged(node: ReactiveNode): {
    epoch: number;
    invalidatedConsumers: string[];
  } {
    // Advance the global epoch before propagating the change.
    const epoch = this.epoch.increment();

    // Record the value change and collect newly invalid consumers.
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
}
