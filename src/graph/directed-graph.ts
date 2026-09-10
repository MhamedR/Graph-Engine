import {GraphNode} from './graph-node.js';
import {GraphEdge} from './graph-edge.js';
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
  private readonly outgoing = new Map<string, Set<GraphEdge>>();
  /** Maps each node ID to the IDs of nodes with edges pointing to it. */
  private readonly incoming = new Map<string, Set<GraphEdge>>();
  /**
   * Tracks the number of structural changes made to the graph.
   *
   * The version starts at `0` and advances whenever the graph structure
   * changes, such as when a node or edge is added or removed.
   *
   * This gives consumers a cheap way to determine whether the graph has
   * changed since they last observed it.
   */
  private _version = 0;
  /**
   * Returns the current structural version of the graph.
   *
   * The version changes when the graph's structure changes. Reading the
   * version does not modify the graph.
   *
   * @returns The current graph version.
   */
  get version(): number {
    // Return the current structural version without changing it.
    return this._version;
  }
  /**
   * Adds a node to the graph.
   *
   * Every node receives an empty outgoing and incoming edge set so that
   * both adjacency indexes are immediately ready to use.
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
    // The graph structure has changed, so advance its version.
    this.incrementVersion();
  }
  /**
   * Removes a node and all edges connected to it.
   *
   * Removing a node requires removing both its outgoing and incoming edges.
   * This keeps the outgoing and incoming adjacency indexes synchronized.
   *
   * @param id - ID of the node to remove.
   */
  removeNode(id: string): void {
    // Nothing to do when the node does not exist.
    if (!this.nodes.has(id)) {
      return;
    }

    // Copy the edge relationships before removing them.
    //
    // We make copies because removeEdge() mutates the original Sets while
    // we are iterating through the relationships.
    const incomingEdges = [...this.incoming.get(id)!];
    const outgoingEdges = [...this.outgoing.get(id)!];

    // Remove every edge pointing into this node.
    for (const edge of incomingEdges) {
      this.removeEdge(edge.from, edge.to);
    }

    // Remove every edge leaving this node.
    for (const edge of outgoingEdges) {
      this.removeEdge(edge.from, edge.to);
    }

    // Finally remove the node's adjacency indexes and node entry.
    this.incoming.delete(id);
    this.outgoing.delete(id);
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
  /**
   * Adds a directed edge from one node to another.
   *
   * The same GraphEdge object is stored in both adjacency indexes:
   *
   *     outgoing[from]
   *              │
   *              ▼
   *          GraphEdge
   *              │
   *              ▼
   *     incoming[to]
   *
   * Adding an existing relationship has no effect.
   *
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @throws {Error} If either node does not exist in the graph.
   */
  addEdge(from: string, to: string): void {
    this.assertNodeExists(from);
    this.assertNodeExists(to);

    // Avoid creating a duplicate relationship.
    if (this.hasEdge(from, to)) {
      return;
    }

    // Create one edge object representing this relationship.
    const edge = new GraphEdge(from, to);

    // Store the same edge in both directions.
    this.outgoing.get(from)!.add(edge);
    this.incoming.get(to)!.add(edge);
    // The graph structure has changed, so advance its version.
    this.incrementVersion();
  }
  /**
   * Removes a directed edge from one node to another.
   *
   * The matching GraphEdge is removed from both adjacency indexes.
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

    // Find the relationship object shared by both indexes.
    const edge = [...this.outgoing.get(from)!].find((candidate) => candidate.to === to);

    // Nothing to remove if the relationship does not exist.
    if (!edge) {
      return;
    }

    // Remove the same edge object from both indexes.
    this.outgoing.get(from)!.delete(edge);
    this.incoming.get(to)!.delete(edge);
    // The graph structure has changed, so advance its version.
    this.incrementVersion();
  }
  /**
   * Returns all nodes that can be reached directly from the given node.
   *
   * @param id - ID of the source node.
   * @returns The source node's direct outgoing neighbors.
   * @throws {Error} If the node does not exist in the graph.
   */
  getOutgoing(id: string): GraphNode[] {
    this.assertNodeExists(id);

    return [...this.outgoing.get(id)!]
      .map((edge) => this.nodes.get(edge.to))
      .filter((node): node is GraphNode => node !== undefined);
  }
  /**
   * Returns all nodes that have a direct edge pointing to the given node.
   *
   * @param id - ID of the destination node.
   * @returns The node's direct incoming neighbors.
   * @throws {Error} If the node does not exist in the graph.
   */
  getIncoming(id: string): GraphNode[] {
    this.assertNodeExists(id);

    return [...this.incoming.get(id)!]
      .map((edge) => this.nodes.get(edge.from))
      .filter((node): node is GraphNode => node !== undefined);
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
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @returns `true` when a direct edge from `from` to `to` exists.
   * @throws {Error} If either node does not exist in the graph.
   */
  hasEdge(from: string, to: string): boolean {
    this.assertNodeExists(from);

    this.assertNodeExists(to);

    // Search the source's outgoing edges for the requested destination.
    return [...this.outgoing.get(from)!].some((edge) => edge.to === to);
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
   * Validates the internal consistency of the graph's adjacency indexes.
   *
   * Every directed edge is stored as the same GraphEdge object in two places:
   *
   *     outgoing[from]
   *     incoming[to]
   *
   * Both indexes must reference the same relationship.
   *
   * @throws {Error} If an inconsistency is found in the graph.
   */
  validate(): void {
    // Check every outgoing relationship.
    for (const [fromId, edges] of this.outgoing) {
      if (!this.nodes.has(fromId)) {
        throw new Error(
          `Graph invariant violated: outgoing index contains unknown node "${fromId}".`,
        );
      }

      for (const edge of edges) {
        // Verify that the edge agrees with the adjacency index containing it.
        if (edge.from !== fromId) {
          throw new Error(
            `Graph invariant violated: outgoing edge has source "${edge.from}" ` +
              `but is stored under "${fromId}".`,
          );
        }

        // The destination must be a real graph node.
        if (!this.nodes.has(edge.to)) {
          throw new Error(
            `Graph invariant violated: edge "${edge.from}" → "${edge.to}" ` +
              `points to an unknown node.`,
          );
        }

        // The same edge object must exist in the reverse index.
        if (!this.incoming.get(edge.to)!.has(edge)) {
          throw new Error(
            `Graph invariant violated: outgoing edge "${edge.from}" → "${edge.to}" ` +
              `has no matching incoming relationship.`,
          );
        }
      }
    }

    // Check every incoming relationship.
    for (const [toId, edges] of this.incoming) {
      if (!this.nodes.has(toId)) {
        throw new Error(
          `Graph invariant violated: incoming index contains unknown node "${toId}".`,
        );
      }

      for (const edge of edges) {
        // Verify that the edge agrees with the adjacency index containing it.
        if (edge.to !== toId) {
          throw new Error(
            `Graph invariant violated: incoming edge has destination "${edge.to}" ` +
              `but is stored under "${toId}".`,
          );
        }

        // The source must be a real graph node.
        if (!this.nodes.has(edge.from)) {
          throw new Error(
            `Graph invariant violated: edge "${edge.from}" → "${edge.to}" ` +
              `comes from an unknown node.`,
          );
        }

        // The same edge object must exist in the reverse index.
        if (!this.outgoing.get(edge.from)!.has(edge)) {
          throw new Error(
            `Graph invariant violated: incoming edge "${edge.from}" → "${edge.to}" ` +
              `has no matching outgoing relationship.`,
          );
        }
      }
    }
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
  /**
   * Advances the graph's structural version.
   *
   * Keeping version updates in one helper makes it harder to accidentally
   * modify the version inconsistently when new graph operations are added.
   */
  private incrementVersion(): void {
    // Advance the graph to its next structural version.
    this._version++;
  }
}
