/**
 * Represents a directed edge between two graph nodes.
 *
 * An edge describes a relationship:
 *
 *     A ───► B
 *
 * Each edge has a source, a destination, an identity scoped to the graph that
 * created it, and a version for the relationship.
 *
 * Graph-owned edges receive IDs from {@link DirectedGraph}. A detached edge
 * constructed without an ID uses `0`.
 */
export class GraphEdge {
  /**
   * Current version of the relationship.
   *
   * Version `0` represents the initial state of a newly created edge.
   */
  private _version = 0;

  /**
   * Creates a directed graph edge.
   *
   * @param from - ID of the source node.
   * @param to - ID of the destination node.
   * @param id - Identity of this edge. DirectedGraph assigns per-graph IDs.
   * Detached edges default to `0`.
   */
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly id: number = 0,
  ) {}

  /**
   * Returns the current version of this edge.
   *
   * @returns The edge's current version number.
   */
  get version(): number {
    return this._version;
  }

  /**
   * Increments the version of this relationship.
   *
   * A version change represents some state change associated with the
   * relationship. The graph itself does not yet interpret what changed;
   * it only records that the version advanced.
   */
  incrementVersion(): void {
    this._version++;
  }
}
