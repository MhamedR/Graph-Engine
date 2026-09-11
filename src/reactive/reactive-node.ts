import {ReactiveLink} from './reactive-link.js';
/**
 * Represents a node in a reactive dependency graph.
 *
 * A reactive node can eventually participate in both directions of a
 * dependency relationship:
 *
 *     Producer ───► Consumer
 *
 * The producer represents something being depended on, while the consumer
 * represents something that needs the producer's value.
 *
 * For now, the node only tracks its identity and version. Dependency
 * relationships and change propagation will be added later.
 */
export class ReactiveNode {
  /**
   * Current version of the node's value.
   *
   * A version change indicates that the node's current value may have
   * changed since the previous version.
   */
  private _version = 0;
  /**
   * Indicates whether this node currently needs to be checked.
   *
   * A dirty node may have stale information because one of its dependencies
   * changed.
   */
  private _dirty = false;
  /**
   * Stores the epoch in which this node was last checked.
   *
   * A value of `-1` means the node has not been checked yet.
   *
   * Tracking the last checked epoch will eventually allow the reactive
   * system to skip repeated dependency checks when nothing has changed
   * since the previous check.
   */
  private _lastCheckedEpoch = -1;
  /**
   * Indicates whether this node is currently evaluating its computation.
   *
   * This prevents the reactive system from treating a node that is actively
   * rebuilding its dependencies as an ordinary clean or dirty node.
   */
  private _computing = false;
  /**
   * Relationships representing the producers this node depends on.
   *
   * For example:
   *
   *     A ───► B
   *
   * If B depends on A, B stores the relationship to A in this collection.
   */
  private readonly producers = new Set<ReactiveLink>();
  /**
   * Tracks producers that were read during the current computation.
   *
   * This set is populated while the node is the active consumer. After the
   * computation finishes, it can be compared with the previous dependency
   * set to remove relationships that are no longer used.
   */
  private readonly activeProducers = new Set<ReactiveNode>();
  /**
   * Relationships representing the consumers that depend on this node.
   *
   * For example:
   *
   *     A ───► B
   *
   * If B depends on A, A stores the relationship to B in this collection.
   */
  private readonly consumers = new Set<ReactiveLink>();

  /**
   * Creates a reactive node.
   *
   * @param id - Unique identifier for this reactive node.
   */
  constructor(public readonly id: string) {}

  /**
   * Returns the current version of this node.
   *
   * @returns The node's current version.
   */
  get version(): number {
    // Return the current version without modifying the node.
    return this._version;
  }
  /**
   * Returns whether this node is currently dirty.
   *
   * @returns `true` when the node needs to be checked.
   */
  get dirty(): boolean {
    // Return the current dirty state without modifying it.
    return this._dirty;
  }
  /**
   * Returns the number of direct producers connected to this node.
   *
   * @returns The number of direct producer dependencies.
   */
  get producerCount(): number {
    return this.producers.size;
  }

  /**
   * Returns the number of direct consumers connected to this node.
   *
   * @returns The number of direct downstream consumers.
   */
  get consumerCount(): number {
    return this.consumers.size;
  }
  /**
   * Returns whether this node is currently being computed.
   *
   * @returns `true` while the node's computation is executing.
   */
  get computing(): boolean {
    return this._computing;
  }
  /**
   * Advances this node to a new value version.
   *
   * This method is kept as a low-level version operation. Call
   * {@link markChanged} when the operation represents an actual value change.
   */
  incrementVersion(): void {
    // Delegate to the semantic change operation.
    this.markChanged();
  }
  /**
   * Marks this node's current value as changed.
   *
   * Advancing the node version makes dependency links stale. Consumers are
   * also notified so they can defer their own validation until needed.
   */
  private markChanged(): void {
    // Advance this node to a new value version.
    this._version++;

    // Notify direct consumers that they may now have stale information.
    this.notifyConsumers();
  }
  /**
   * Returns the reactive nodes this node currently depends on.
   *
   * @returns An array containing the IDs of all producer nodes.
   */
  getProducerIds(): string[] {
    // Convert the dependency relationships into producer IDs.
    return [...this.producers].map((link) => link.producer.id);
  }
  /**
   * Returns the reactive nodes that depend on this node.
   *
   * @returns An array containing the IDs of all consumer nodes.
   */
  getConsumerIds(): string[] {
    // Convert the consumer relationships into consumer IDs.
    return [...this.consumers].map((link) => link.consumer.id);
  }
  /**
   * Records a dependency on a producer.
   *
   * A consumer can depend on a particular producer only once. If the
   * relationship already exists, the existing link is returned instead of
   * creating a duplicate relationship.
   *
   * @param producer - The reactive node this node depends on.
   * @returns The existing or newly created dependency relationship.
   */
  addProducer(producer: ReactiveNode): ReactiveLink {
    // Check whether this consumer already depends on the producer.
    for (const link of this.producers) {
      if (link.producer === producer) {
        // Reuse the existing relationship instead of creating a duplicate.
        return link;
      }
    }

    // Create a relationship containing direct references to both nodes.
    const link = new ReactiveLink(producer, this);

    // Store the relationship on the consumer side.
    this.producers.add(link);

    // Store the same relationship on the producer side.
    producer.consumers.add(link);

    // Return the newly created relationship.
    return link;
  }
  /**
   * Removes a dependency on a producer.
   *
   * The relationship is removed from both the consumer's producer index and
   * the producer's consumer index.
   *
   * Removing a relationship that does not exist has no effect.
   *
   * @param producer - The reactive node that should no longer be depended on.
   */
  removeProducer(producer: ReactiveNode): void {
    // Find the relationship connecting this consumer to the producer.
    const link = [...this.producers].find((candidate) => candidate.producer === producer);

    // There is nothing to remove when no relationship exists.
    if (link === undefined) {
      return;
    }

    // Remove the relationship from the consumer's producer index.
    this.producers.delete(link);

    // Remove the exact same relationship from the producer's consumer index.
    producer.consumers.delete(link);
  }
  /**
   * Checks whether this node currently depends on a producer.
   *
   * @param producer - The reactive node to check.
   * @returns `true` when a dependency relationship exists.
   */
  hasProducer(producer: ReactiveNode): boolean {
    // Search the consumer's producer relationships for the requested node.
    for (const link of this.producers) {
      if (link.producer === producer) {
        // A matching relationship exists.
        return true;
      }
    }

    // No relationship exists between these two nodes.
    return false;
  }
  /**
   * Checks whether any producer this node depends on has changed.
   *
   * Each dependency relationship remembers the producer version that the
   * consumer last observed. If any relationship is stale, the consumer may
   * have outdated information.
   *
   * @returns `true` when at least one producer has changed.
   */
  hasStaleProducer(): boolean {
    // Check every dependency relationship owned by this consumer.
    for (const link of this.producers) {
      if (link.isStale()) {
        // One stale dependency is enough to make the consumer potentially stale.
        return true;
      }
    }

    // Every producer is still at the version previously observed.
    return false;
  }
  /**
   * Marks every current dependency as observed.
   *
   * Calling this method records the current producer version on every
   * dependency relationship owned by this consumer.
   *
   * After all dependencies have been observed, the consumer should no
   * longer report a stale producer.
   */
  markClean(): void {
    // Update every dependency relationship to the producer's current version.
    for (const link of this.producers) {
      link.markCurrent();
    }
  }
  /**
   * Marks this node as dirty.
   *
   * If the node is already dirty, no state change occurs.
   *
   * @returns `true` when the node changed from clean to dirty.
   */
  markDirty(): boolean {
    // Avoid doing work when this node is already dirty.
    if (this._dirty) {
      return false;
    }

    // Record that this node now needs to be checked.
    this._dirty = true;

    // Report that the dirty state actually changed.
    return true;
  }
  /**
   * Marks this node as clean after checking its dependencies.
   *
   * Cleaning a consumer performs two related operations:
   *
   * 1. The node is no longer marked dirty.
   * 2. Every dependency records the producer version that was observed.
   *
   * This keeps the node's dirty state and dependency observations
   * synchronized.
   */
  markCleanState(): void {
    // Record that this node no longer needs to be checked.
    this._dirty = false;

    // Record the current version of every producer this node depends on.
    this.markClean();
  }
  /**
   * Propagates dirty state to all downstream consumers.
   *
   * The traversal continues through already-dirty nodes so that a change can
   * reach consumers further downstream in the dependency graph.
   *
   * @returns The IDs of consumers that became newly dirty.
   */
  notifyConsumers(): string[] {
    // Keep track of nodes we have already visited so cycles cannot cause
    // an infinite traversal.
    const visited = new Set<ReactiveNode>();

    // Start propagation from this node.
    const queue: ReactiveNode[] = [this];

    // Store only nodes that actually changed from clean to dirty.
    const notified: string[] = [];

    while (queue.length > 0) {
      // Remove the next node from the traversal queue.
      const current = queue.shift()!;

      // Skip nodes that have already been traversed.
      if (visited.has(current)) {
        continue;
      }

      // Mark this node as visited.
      visited.add(current);

      // Visit every downstream consumer.
      for (const link of current.consumers) {
        const consumer = link.consumer;

        // Mark the consumer dirty.
        const becameDirty = consumer.markDirty();

        // Record consumers that transitioned from clean to dirty.
        if (becameDirty) {
          notified.push(consumer.id);
        }

        // Continue traversing regardless of whether this consumer was
        // already dirty. A dirty node can still have clean descendants.
        queue.push(consumer);
      }
    }

    return notified;
  }
  /**
   * Checks whether any producer changed since this node last observed it.
   *
   * @param epoch - The current global reactive epoch.
   * @returns `true` when at least one producer is stale.
   */
  pollProducersForChange(epoch: number): boolean {
    // If this node has already been checked during this epoch, avoid
    // repeating the same dependency scan.
    if (this.hasBeenCheckedInEpoch(epoch)) {
      return false;
    }

    // Record that this node has now been checked for this epoch.
    this.markCheckedAtEpoch(epoch);

    // A dirty node must re-check its producers even if its cached value
    // has not yet been refreshed.
    for (const link of this.producers) {
      if (link.isStale()) {
        return true;
      }
    }

    return false;
  }
  /**
   * Checks whether this node has already been checked during the given epoch.
   *
   * @param epoch - The current global reactive epoch.
   * @returns `true` when this node was already checked during the epoch.
   */
  hasBeenCheckedInEpoch(epoch: number): boolean {
    return this._lastCheckedEpoch === epoch;
  }

  /**
   * Records that this node has been checked during the given epoch.
   *
   * @param epoch - The current global reactive epoch.
   */
  markCheckedAtEpoch(epoch: number): void {
    this._lastCheckedEpoch = epoch;
  }
  /**
   * Marks this node as changed after the runtime has advanced the epoch.
   *
   * This is intentionally a low-level operation. Application code should
   * normally call ReactiveRuntime.markChanged() instead.
   */
  markChangedFromRuntime(): void {
    // Advance this node's local version.
    this._version++;

    // Notify downstream consumers.
    this.notifyConsumers();
  }
  /**
   * Starts collecting dependencies for a new computation.
   *
   * Existing dependency relationships are preserved until the computation
   * finishes. This allows us to compare the previous and newly observed
   * dependencies.
   */
  beginDependencyTracking(): void {
    // Start with an empty set of dependencies observed during this run.
    this.activeProducers.clear();
  }
  /**
   * Records that a producer was read during the current computation.
   *
   * @param producer - The producer that was observed.
   */
  trackProducer(producer: ReactiveNode): void {
    // Record the producer for the current computation.
    this.activeProducers.add(producer);
  }
  /**
   * Returns the producers observed during the current computation.
   *
   * @returns A snapshot of the producers read during the current run.
   */
  getTrackedProducers(): ReactiveNode[] {
    // Return a copy so callers cannot mutate the internal tracking set.
    return [...this.activeProducers];
  }
  /**
   * Synchronizes the dependency relationships with the producers observed
   * during the most recent computation.
   *
   * Producers that were observed are kept or added. Producers that were part
   * of the previous computation but were not observed this time are removed.
   */
  synchronizeDependencies(): void {
    // Create a Set for efficient lookup of the producers used by the
    // current computation.
    const nextProducers = new Set(this.activeProducers);

    // Remove dependencies that were not used during this computation.
    for (const link of [...this.producers]) {
      if (!nextProducers.has(link.producer)) {
        this.removeProducer(link.producer);
      }
    }

    // Add dependencies that are new to this computation.
    for (const producer of nextProducers) {
      if (!this.hasProducer(producer)) {
        this.addProducer(producer);
      }
    }
  }
  /**
   * Marks this node as currently computing.
   *
   * @throws {Error} If the node is already being computed.
   */
  beginComputation(): void {
    if (this._computing) {
      throw new Error(`Reactive node "${this.id}" is already being computed.`);
    }

    this._computing = true;
  }

  /**
   * Marks this node as no longer computing.
   */
  endComputation(): void {
    this._computing = false;
  }
}
