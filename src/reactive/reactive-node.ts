import {ReactiveLink} from './reactive-link.js';

/**
 * Describes the observable diagnostic state of a reactive node.
 */
export interface ReactiveNodeState {
  /** Unique identifier of the node. */
  id: string;

  /** Current local value version. */
  version: number;

  /** Whether the node is currently dirty. */
  dirty: boolean;

  /** Whether the node is currently being computed. */
  computing: boolean;

  /** Number of producer dependencies. */
  producerCount: number;

  /** Number of downstream consumers. */
  consumerCount: number;

  /** Whether all producer dependencies are currently fresh. */
  fresh: boolean;

  /** Whether the node's graph relationships are structurally valid. */
  consistent: boolean;

  /** Whether the node is both structurally valid and reactively fresh. */
  healthy: boolean;

  /** Whether the node has no producer or consumer relationships. */
  isolated: boolean;
}
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

  private _lastChangedProducer: ReactiveLink | undefined;
  /**
   * Callback invoked when this node becomes newly invalid.
   *
   * ReactiveEffect uses this hook to schedule itself after dependency
   * invalidation without making ReactiveNode depend directly on the effect
   * implementation.
   */
  private _onInvalidate: (() => void) | undefined;
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
   * Returns a snapshot of the node's current diagnostic state.
   *
   * A fresh object is returned so callers cannot mutate the node through the
   * diagnostic snapshot.
   *
   * @returns Current reactive node state.
   */
  get state(): ReactiveNodeState {
    // Capture each diagnostic property at the time the snapshot is created.
    return {
      id: this.id,
      version: this.version,
      dirty: this.dirty,
      computing: this.computing,
      producerCount: this.producerCount,
      consumerCount: this.consumerCount,
      fresh: this.hasFreshProducers(),
      consistent: this.hasConsistentRelationships(),
      healthy: this.isHealthy(),
      isolated: this.isIsolated(),
    };
  }
  /**
   * Returns the reactive nodes currently producing this node.
   *
   * A new array is returned so callers cannot mutate the internal dependency
   * collection directly.
   *
   * @returns The current producer nodes.
   */
  getProducers(): ReactiveNode[] {
    // Extract the producer node from each dependency link.
    return [...this.producers].map((link) => link.producer);
  }
  /**
   * Returns the dependency links from this node to all of its producers.
   *
   * A copy of the internal set is returned so callers cannot mutate the
   * node's dependency graph directly.
   *
   * @returns A new set containing this node's producer links.
   */
  getProducerLinks(): Set<ReactiveLink> {
    // Return a defensive copy so the internal dependency relationships remain
    // controlled by ReactiveNode.
    return new Set(this.producers);
  }
  /**
   * Advances this node to a new value version.
   *
   * This is a low-level state operation. Change propagation is deliberately
   * handled by ReactiveRuntime rather than by the node itself.
   */
  incrementVersion(): void {
    // Advance only this node's local version.
    this._version++;
  }
  /**
   * Records that this node's value changed and propagates invalidation.
   *
   * This combines the local version update with downstream invalidation so
   * callers do not need to coordinate those two operations themselves.
   *
   * @returns The IDs of consumers that became newly invalid.
   */
  markValueChanged(): string[] {
    // Advance this node's local version.
    this.incrementVersion();

    // Invalidate downstream consumers and report newly invalid consumers.
    return this.notifyConsumers();
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
    // Ask each dependency link whether its producer has changed.
    for (const link of this.producers) {
      if (link.hasChanged()) return true;
    }

    // Every producer is still at the version previously observed.
    return false;
  }
  /**
   * Synchronizes all producer links with their current producer versions.
   *
   * Calling this method records that this node has observed every tracked
   * producer at its current version.
   */
  synchronizeProducerVersions(): void {
    // Record the current version of every tracked producer.
    for (const link of this.producers) {
      link.markCurrent();
    }

    // The previously detected producer is no longer stale after synchronization.
    this._lastChangedProducer = undefined;
  }
  /**
   * Clears this node's invalidated state.
   *
   * This operation only changes the node's dirty flag. Producer version
   * synchronization is handled separately.
   */
  clearDirty(): void {
    // The node is valid again after a successful computation.
    this._dirty = false;
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

        // Invalidate the downstream consumer when this node changes.
        const becameDirty = consumer.invalidate();

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
   * Checks whether a producer changed since this node was last checked.
   *
   * @param epoch - Current global reactive epoch.
   * @returns The first changed dependency link, or `undefined` when all
   * producers are current.
   */
  pollProducersForChange(epoch: number): ReactiveLink | undefined {
    // Reuse the result already established during this epoch.
    if (this.hasBeenCheckedInEpoch(epoch)) {
      return this._lastChangedProducer;
    }

    // Record that this node has now been checked for this epoch.
    this.markCheckedAtEpoch(epoch);

    // Reset the cached changed dependency before checking producers.
    this._lastChangedProducer = undefined;

    // Return and remember the first dependency whose producer has changed.
    for (const link of this.producers) {
      if (link.hasChanged()) {
        this._lastChangedProducer = link;
        return link;
      }
    }

    return undefined;
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
   * Starts a new dependency-tracking cycle for this node.
   *
   * Previous temporary producer observations are discarded because the
   * upcoming computation will establish the dependencies that should remain.
   */
  beginDependencyTracking(): void {
    // Start collecting dependencies from scratch.
    this.activeProducers.clear();

    // Discard any previously remembered changed dependency.
    this._lastChangedProducer = undefined;
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
  /**
   * Invalidates this node's cached state.
   *
   * Invalidating a node does not change its value version. It only records
   * that the node must refresh before its cached result can be trusted.
   *
   * @returns `true` when the node transitioned from clean to dirty.
   */
  invalidate(): boolean {
    // Do not repeatedly notify the same node while it is already dirty.
    if (this._dirty) {
      return false;
    }

    // Record the transition from clean to dirty.
    this._dirty = true;

    // Notify the owner of the newly invalidated node.
    this._onInvalidate?.();

    return true;
  }
  /**
   * Registers a callback that runs when this node transitions from clean
   * to dirty.
   *
   * @param callback - Function to invoke after invalidation.
   */
  setOnInvalidate(callback: (() => void) | undefined): void {
    // Store the invalidation hook without coupling the node to a specific
    // reactive consumer implementation.
    this._onInvalidate = callback;
  }
  /**
   * Removes all producer relationships from this node.
   *
   * This also removes the corresponding consumer relationships from every
   * producer, keeping both sides of the dependency graph synchronized.
   */
  clearProducers(): void {
    // Copy the links before removing them because the producer collection is
    // modified during cleanup.
    const links = [...this.producers];

    // Remove each dependency through the existing bidirectional cleanup path.
    for (const link of links) {
      this.removeProducer(link.producer);
    }
  }
  /**
   * Removes all consumer relationships from this node.
   *
   * This also removes the corresponding producer relationships from every
   * consumer, keeping both sides of the dependency graph synchronized.
   */
  clearConsumers(): void {
    // Copy the links before removing them because the consumer collection is
    // modified during cleanup.
    const links = [...this.consumers];

    // Remove each dependency from the consumer side.
    for (const link of links) {
      link.consumer.removeProducer(this);
    }
  }
  /**
   * Removes every dependency relationship connected to this node.
   *
   * This clears both producer and consumer relationships, leaving the node
   * isolated from the reactive graph.
   */
  clearDependencies(): void {
    // Remove all incoming dependency relationships.
    this.clearProducers();

    // Remove all outgoing dependency relationships.
    this.clearConsumers();
  }
  /**
   * Returns whether this node is completely disconnected from the reactive
   * graph.
   *
   * A node is isolated when it has neither producers nor consumers.
   *
   * @returns `true` when the node has no graph relationships.
   */
  isIsolated(): boolean {
    // A node is isolated only when both sides of its dependency graph are empty.
    return this.producers.size === 0 && this.consumers.size === 0;
  }
  /**
   * Verifies that every producer and consumer relationship connected to this
   * node is represented consistently on both sides of the graph.
   *
   * It also verifies that dependency links have not observed a producer version
   * that does not yet exist.
   *
   * This is intended as a debugging and testing invariant rather than a
   * performance-critical operation.
   *
   * @returns `true` when every connected relationship is valid.
   */
  hasConsistentRelationships(): boolean {
    // Every producer link must also appear in that producer's consumer set.
    for (const link of this.producers) {
      if (!link.producer.consumers.has(link)) {
        return false;
      }

      if (link.consumer !== this) {
        return false;
      }

      // A dependency cannot have observed a future producer version.
      if (link.version > link.producer.version) {
        return false;
      }
    }

    // Every consumer link must also appear in that consumer's producer set.
    for (const link of this.consumers) {
      if (!link.consumer.producers.has(link)) {
        return false;
      }

      if (link.producer !== this) {
        return false;
      }

      // The shared link must agree with this node as its producer.
      if (link.version > this.version) {
        return false;
      }
    }

    return true;
  }
  /**
   * Returns whether this node's dependency relationships are currently fresh.
   *
   * A node is fresh when none of its producer links observe an older producer
   * version. Structural graph consistency is intentionally not checked here.
   *
   * @returns `true` when every producer dependency is up to date.
   */
  hasFreshProducers(): boolean {
    // Check every producer link for a version mismatch.
    for (const link of this.producers) {
      if (link.hasChanged()) {
        return false;
      }
    }

    return true;
  }
  /**
   * Returns whether this node is structurally valid and its producer
   * dependencies are currently fresh.
   *
   * This is a convenience diagnostic method. It does not modify the node.
   *
   * @returns `true` when graph relationships are consistent and all producer
   * dependencies are fresh.
   */
  isHealthy(): boolean {
    // Structural consistency and reactive freshness are independent checks,
    // so both must pass for the node to be considered healthy.
    return this.hasConsistentRelationships() && this.hasFreshProducers();
  }
}
