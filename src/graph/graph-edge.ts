/**
 * Represents a directed edge between two graph nodes.
 *
 * An edge describes a relationship:
 *
 *     A ───► B
 *
 * Each edge has:
 *
 * - a unique identity,
 * - a source node,
 * - a destination node,
 * - a version representing the current state of the relationship.
 *
 * The version will become important when we introduce reactive change
 * detection later in the project.
 */
export class GraphEdge {
  /**
   * Generates the ID for the next edge created.
   */
  private static nextId = 0;

  /**
   * Unique identity of this edge.
   */
  public readonly id: number;

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
   */
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    // Assign a unique identity to this relationship.
    this.id = GraphEdge.nextId++;
  }

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
    // Move the relationship to its next version.
    this._version++;
  }
}
