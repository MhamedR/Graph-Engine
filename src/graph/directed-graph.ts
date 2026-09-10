import {GraphNode} from './graph-node.js';
/**
 * Represents a directed graph of {@link GraphNode} instances.
 *
 * Nodes are uniquely identified by their `id`. Edges are directed and
 * represented internally using both outgoing and incoming adjacency maps.
 */
export class DirectedGraph {
  /** All nodes in the graph, indexed by node ID. */
  private readonly nodes = new Map<string, GraphNode>();
  /** Maps each node ID to the IDs of nodes it has edges pointing to. */
  private readonly outgoing = new Map<string, Set<string>>();
  /** Maps each node ID to the IDs of nodes with edges pointing to it. */
  private readonly incoming = new Map<string, Set<string>>();
  // ---------------------------------------------------------------------------
  // Node management
  // ---------------------------------------------------------------------------
  /**
   * Adds a node to the graph.
   *
   * @param node - The node to add.
   * @throws {Error} If a node with the same ID already exists.
   */
  addNode(node: GraphNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node "${node.id}" already exists.`);
    }
    this.nodes.set(node.id, node);
    this.outgoing.set(node.id, new Set());
    this.incoming.set(node.id, new Set());
  }
  /**
   * Removes a node and all edges connected to it.
   *
   * Removing a node requires removing both its outgoing and incoming edges.
   * This keeps the outgoing and incoming adjacency indexes synchronized.
   *
   * For example, given:
   *
   *     A ───► B ───► C
   *     │
   *     └────► D
   *
   * Removing B must remove both:
   *
   *     A ───► B
   *     B ───► C
   *
   * After removal, neither A nor C should retain a reference to B.
   *
   * Removing a node that does not exist has no effect.
   *
   * @param id - ID of the node to remove.
   */
  removeNode(id: string): void {
    // If the node does not exist, there is nothing to remove.
    if (!this.nodes.has(id)) {
      return;
    }
    // Get all nodes that currently point to this node.
    //
    // We copy the Set into an array because removing edges will modify
    // the underlying adjacency sets while we iterate.
    const incomingIds = [...this.incoming.get(id)!];
    // Get all nodes that this node currently points to.
    //
    // Again, we create a copy so that the collection can safely be
    // modified while we remove the connected edges.
    const outgoingIds = [...this.outgoing.get(id)!];
    // Remove every edge pointing into this node.
    for (const fromId of incomingIds) {
      this.removeEdge(fromId, id);
    }
    // Remove every edge pointing out from this node.
    for (const toId of outgoingIds) {
      this.removeEdge(id, toId);
    }
    // Remove the node's adjacency sets.
    this.incoming.delete(id);
    this.outgoing.delete(id);
    // Finally remove the node itself from the node registry.
    this.nodes.delete(id);
  }
  /**
   * Checks whether a node with the given ID exists in the graph.
   *
   * @param id - The ID of the node to check.
   * @returns `true` if the node exists, otherwise `false`.
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }
  /**
   * Gets a node by its ID.
   *
   * @param id - The ID of the node to retrieve.
   * @returns The matching node, or `undefined` if it does not exist.
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
  // ---------------------------------------------------------------------------
  // Edge management
  // ---------------------------------------------------------------------------
  /**
   * Adds a directed edge from one node to another.
   *
   * The edge is recorded in both the outgoing index of `from` and the
   * incoming index of `to`. Adding an existing edge has no effect.
   *
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @throws {Error} If either node does not exist in the graph.
   */
  addEdge(from: string, to: string): void {
    this.assertNodeExists(from);
    this.assertNodeExists(to);
    this.outgoing.get(from)!.add(to);
    this.incoming.get(to)!.add(from);
  }
  /**
   * Removes a directed edge from one node to another.
   *
   * The edge must be removed from both the outgoing index of `from` and the
   * incoming index of `to` so that the graph's two adjacency indexes remain
   * consistent.
   *
   * Removing an edge that does not exist has no effect.
   *
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @throws {Error} If either node does not exist in the graph.
   */
  removeEdge(from: string, to: string): void {
    this.assertNodeExists(from);
    this.assertNodeExists(to);
    // Remove the destination from the source's outgoing adjacency set.
    this.outgoing.get(from)!.delete(to);
    // Remove the source from the destination's incoming adjacency set.
    this.incoming.get(to)!.delete(from);
  }
  // ---------------------------------------------------------------------------
  // Relationship queries
  // ---------------------------------------------------------------------------
  /**
   * Returns all nodes that can be reached directly from the given node.
   *
   * For an edge:
   *
   *     A ───► B
   *
   * B is an outgoing neighbor of A.
   */
  getOutgoing(id: string): GraphNode[] {
    this.assertNodeExists(id);
    // Get the IDs of nodes connected from this node.
    const outgoingIds = this.outgoing.get(id)!;
    // Convert the IDs back into GraphNode objects.
    return (
      [...outgoingIds]
        .map((nodeId) => this.nodes.get(nodeId))
        // The filter protects us from accidentally returning undefined.
        .filter((node): node is GraphNode => node !== undefined)
    );
  }
  /**
   * Returns all nodes that have a direct edge pointing to the given node.
   *
   * For an edge:
   *
   *     A ───► B
   *
   * A is an incoming neighbor of B.
   */
  getIncoming(id: string): GraphNode[] {
    this.assertNodeExists(id);
    // Get the IDs of nodes that point to this node.
    const incomingIds = this.incoming.get(id)!;
    // Convert the IDs back into GraphNode objects.
    return (
      [...incomingIds]
        .map((nodeId) => this.nodes.get(nodeId))
        // Only keep nodes that actually exist in the graph.
        .filter((node): node is GraphNode => node !== undefined)
    );
  }
  // ---------------------------------------------------------------------------
  // Graph metrics
  // ---------------------------------------------------------------------------
  /**
   * Returns the number of outgoing edges for a node.
   *
   * The out-degree represents how many direct edges leave the node.
   *
   * For example:
   *
   *     A ───► B
   *     │
   *     ├────► C
   *     │
   *     └────► D
   *
   * The out-degree of A is 3.
   *
   * @param id - ID of the node whose out-degree should be calculated.
   * @returns The number of outgoing edges from the node.
   * @throws {Error} If the node does not exist in the graph.
   */
  getOutDegree(id: string): number {
    // Verify that the node exists before accessing its adjacency set.
    this.assertNodeExists(id);
    // The size of the outgoing adjacency set is exactly the number
    // of direct edges leaving this node.
    return this.outgoing.get(id)!.size;
  }
  /**
   * Returns the number of incoming edges for a node.
   *
   * The in-degree represents how many direct edges point toward the node.
   *
   * For example:
   *
   *     A ───► B
   *     │
   *     └────► C
   *
   * The in-degree of B is 1 and the in-degree of C is 1.
   *
   * @param id - ID of the node whose in-degree should be calculated.
   * @returns The number of incoming edges to the node.
   * @throws {Error} If the node does not exist in the graph.
   */
  getInDegree(id: string): number {
    // Verify that the node exists before accessing its adjacency set.
    this.assertNodeExists(id);
    // The size of the incoming adjacency set is exactly the number
    // of direct edges pointing toward this node.
    return this.incoming.get(id)!.size;
  }
  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------
  /**
   * Returns all nodes currently stored in the graph.
   *
   * The returned array is a snapshot of the graph's current nodes.
   * Modifying the returned array does not modify the graph itself.
   *
   * @returns An array containing every node currently in the graph.
   */
  getNodes(): GraphNode[] {
    // Map.values() gives us an iterator over all registered nodes.
    //
    // Converting it to an array creates a snapshot so callers cannot
    // accidentally mutate the internal Map through the returned value.
    return [...this.nodes.values()];
  }
  /**
   * Checks whether a directed edge exists between two nodes.
   *
   * For an edge:
   *
   *     A ───► B
   *
   * `hasEdge("A", "B")` returns `true`, while `hasEdge("B", "A")`
   * returns `false` unless a separate reverse edge also exists.
   *
   * The graph is directed, so edge direction matters.
   *
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @returns `true` when a direct edge from `from` to `to` exists.
   * @throws {Error} If either node does not exist in the graph.
   */
  hasEdge(from: string, to: string): boolean {
    // Both endpoints must exist before we inspect the adjacency index.
    this.assertNodeExists(from);
    this.assertNodeExists(to);

    // The outgoing set of `from` contains the IDs of every node that
    // can be reached directly from `from`.
    return this.outgoing.get(from)!.has(to);
  }
  /**
   * Returns the number of nodes currently stored in the graph.
   *
   * Each node is uniquely identified by its ID, so the size of the node
   * registry represents the total number of nodes in the graph.
   *
   * @returns The total number of nodes.
   */
  getNodeCount(): number {
    // The nodes Map contains exactly one entry for every node in the graph.
    return this.nodes.size;
  }
  /**
   * Returns the total number of directed edges currently stored in the graph.
   *
   * Every outgoing adjacency set contains the destinations of one source
   * node. Summing the sizes of all outgoing sets therefore gives the total
   * number of directed edges.
   *
   * For example:
   *
   *     A ───► B
   *     │
   *     └────► C
   *
   * has two directed edges.
   *
   * @returns The total number of directed edges.
   */
  getEdgeCount(): number {
    // Start with zero because we have not counted any edges yet.
    let count = 0;

    // Every entry represents the outgoing edges of one source node.
    for (const neighbors of this.outgoing.values()) {
      // Each neighbor represents one directed edge.
      count += neighbors.size;
    }

    // Return the total number of edges across all nodes.
    return count;
  }
  /**
   * Returns basic statistics about the current graph.
   *
   * This method provides a small snapshot of the graph's size without
   * exposing the internal Map and Set data structures.
   *
   * @returns An object containing the node and edge counts.
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
  } {
    // Build the statistics from the graph's existing query methods.
    return {
      nodeCount: this.getNodeCount(),
      edgeCount: this.getEdgeCount(),
    };
  }
  /**
   * Ensures that a node with the given ID exists.
   *
   * @param id - The ID of the node to validate.
   * @throws {Error} If the node does not exist.
   */
  private assertNodeExists(id: string): void {
    if (!this.nodes.has(id)) {
      throw new Error(`Node "${id}" does not exist.`);
    }
  }
}
