/**
 * Describes one dependency relationship in a reactive graph snapshot.
 */
export interface ReactiveGraphSnapshotEdge {
  /** ID of the producer node. */
  producerId: string;

  /** ID of the consumer node. */
  consumerId: string;

  /** Producer version observed by the consumer. */
  version: number;

  /** Whether the producer has changed since the consumer observed it. */
  stale: boolean;
}

/**
 * Describes one reactive node in a graph snapshot.
 */
export interface ReactiveGraphSnapshotNode {
  /** Unique reactive node identifier. */
  id: string;

  /** Current node version. */
  version: number;

  /** Whether the node is dirty. */
  dirty: boolean;

  /** Whether the node is currently being computed. */
  computing: boolean;

  /** Number of producer dependencies. */
  producerCount: number;

  /** Number of downstream consumers. */
  consumerCount: number;
}

/**
 * Represents a read-only diagnostic snapshot of a reactive graph.
 */
export interface ReactiveGraphSnapshot {
  /** Nodes present in the snapshot. */
  readonly nodes: ReactiveGraphSnapshotNode[];

  /** Dependency relationships present in the snapshot. */
  readonly edges: ReactiveGraphSnapshotEdge[];
}
