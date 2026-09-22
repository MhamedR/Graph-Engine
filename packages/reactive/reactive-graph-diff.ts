import {
  ReactiveGraphSnapshot,
  ReactiveGraphSnapshotEdge,
  ReactiveGraphSnapshotNode,
} from './reactive-graph-snapshot.js';

/**
 * Describes changes between two reactive graph snapshots.
 */
export interface ReactiveGraphSnapshotDiff {
  /** Nodes present only in the newer snapshot. */
  readonly addedNodes: readonly ReactiveGraphSnapshotNode[];

  /** Nodes present only in the older snapshot. */
  readonly removedNodes: readonly ReactiveGraphSnapshotNode[];

  /** Dependency edges present only in the newer snapshot. */
  readonly addedEdges: readonly ReactiveGraphSnapshotEdge[];

  /** Dependency edges present only in the older snapshot. */
  readonly removedEdges: readonly ReactiveGraphSnapshotEdge[];

  /** Dependency edges whose version or staleness changed. */
  readonly changedEdges: readonly ReactiveGraphSnapshotEdgeChange[];

  /** Nodes that exist in both snapshots but have changed state. */
  readonly changedNodes: readonly ReactiveGraphSnapshotNodeChange[];
}
/**
 * Describes a node whose state changed between two snapshots.
 */
export interface ReactiveGraphSnapshotNodeChange {
  /** Node state before the change. */
  readonly previous: ReactiveGraphSnapshotNode;

  /** Node state after the change. */
  readonly current: ReactiveGraphSnapshotNode;
}

/**
 * Describes an edge whose tracked state changed between two snapshots.
 */
export interface ReactiveGraphSnapshotEdgeChange {
  /** Edge state before the change. */
  readonly previous: ReactiveGraphSnapshotEdge;

  /** Edge state after the change. */
  readonly current: ReactiveGraphSnapshotEdge;
}

/**
 * Creates a stable identifier for a dependency edge.
 *
 * @param edge - Dependency edge to identify.
 * @returns Stable producer-to-consumer edge identifier.
 */
function edgeKey(edge: ReactiveGraphSnapshotEdge): string {
  return JSON.stringify([edge.producerId, edge.consumerId]);
}

/**
 * Compares two reactive graph snapshots.
 *
 * @param previous - Earlier graph snapshot.
 * @param current - Later graph snapshot.
 * @returns Structural differences between the two snapshots.
 */
export function diffReactiveGraphSnapshots(
  previous: ReactiveGraphSnapshot,
  current: ReactiveGraphSnapshot,
): ReactiveGraphSnapshotDiff {
  // Index nodes by their stable IDs for efficient comparison.
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));

  // Index dependency edges by their producer-to-consumer relationship.
  const previousEdges = new Map(previous.edges.map((edge) => [edgeKey(edge), edge]));
  const currentEdges = new Map(current.edges.map((edge) => [edgeKey(edge), edge]));

  const addedNodes = current.nodes.filter((node) => !previousNodes.has(node.id));

  const removedNodes = previous.nodes.filter((node) => !currentNodes.has(node.id));

  /**
   * Finds nodes that exist in both snapshots but whose observable state changed.
   */
  const changedNodes: ReactiveGraphSnapshotNodeChange[] = [];

  for (const currentNode of current.nodes) {
    const previousNode = previousNodes.get(currentNode.id);

    // A missing previous node is handled separately as an added node.
    if (previousNode === undefined) {
      continue;
    }

    // Record only meaningful state changes.
    if (
      previousNode.version !== currentNode.version ||
      previousNode.kind !== currentNode.kind ||
      previousNode.dirty !== currentNode.dirty ||
      previousNode.computing !== currentNode.computing ||
      previousNode.producerCount !== currentNode.producerCount ||
      previousNode.consumerCount !== currentNode.consumerCount
    ) {
      changedNodes.push({
        previous: previousNode,
        current: currentNode,
      });
    }
  }

  const addedEdges = current.edges.filter((edge) => !previousEdges.has(edgeKey(edge)));

  const removedEdges = previous.edges.filter((edge) => !currentEdges.has(edgeKey(edge)));

  const changedEdges: ReactiveGraphSnapshotEdgeChange[] = [];

  for (const currentEdge of current.edges) {
    const previousEdge = previousEdges.get(edgeKey(currentEdge));

    if (
      previousEdge !== undefined &&
      (previousEdge.version !== currentEdge.version || previousEdge.stale !== currentEdge.stale)
    ) {
      changedEdges.push({previous: previousEdge, current: currentEdge});
    }
  }

  return {
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    changedEdges,
    changedNodes,
  };
}
