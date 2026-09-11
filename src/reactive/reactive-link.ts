import {ReactiveNode} from './reactive-node.js';

/**
 * Represents a dependency relationship between two reactive nodes.
 *
 * The relationship is directed:
 *
 *     Producer ───► Consumer
 *
 * The link keeps direct references to both nodes so future change
 * propagation can move through the dependency graph without repeatedly
 * looking nodes up by ID.
 */
export class ReactiveLink {
  /**
   * The version of the producer that the consumer last observed.
   *
   * A mismatch between this value and the producer's current version will
   * later tell us that the consumer may need to be recomputed.
   */
  public version: number;

  /**
   * Creates a reactive dependency relationship.
   *
   * @param producer - The node being depended upon.
   * @param consumer - The node that depends on the producer.
   */
  constructor(
    public readonly producer: ReactiveNode,
    public readonly consumer: ReactiveNode,
  ) {
    // Capture the producer's current version when the relationship is made.
    this.version = producer.version;
  }
  /**
   * Determines whether the producer has changed since the consumer last
   * observed it.
   *
   * The link stores the producer version that was observed when the
   * relationship was created or last synchronized.
   *
   * @returns `true` when the producer's current version differs from the
   * observed version stored on this link.
   */
  isStale(): boolean {
    // A version mismatch means the consumer may have stale information.
    return this.producer.version !== this.version;
  }
  /**
   * Synchronizes the link with the producer's current version.
   *
   * Calling this method records that the consumer has observed the producer
   * at its current version.
   */
  markCurrent(): void {
    // Record the producer version most recently observed by the consumer.
    this.version = this.producer.version;
  }
}
