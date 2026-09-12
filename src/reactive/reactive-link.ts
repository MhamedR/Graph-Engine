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
   * Determines whether the producer has changed since this link last
   * observed it.
   *
   * @returns `true` when the producer's current version is newer than the
   * version recorded on this dependency link.
   */
  hasChanged(): boolean {
    // Compare the producer's current version with the version observed
    // through this dependency link.
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
