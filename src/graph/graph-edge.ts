/**
 * Represents a directed edge between two graph nodes.
 *
 * An edge describes a relationship:
 *
 *     A ───► B
 *
 * Each edge also receives a unique ID. Giving relationships their own
 * identity will allow us to attach additional state to them later.
 */
export class GraphEdge {
  /**
   * Generates the ID for the next edge created.
   *
   * This counter belongs to the class rather than an individual edge,
   * so every GraphEdge instance receives a different ID.
   */
  private static nextId = 0;

  /**
   * Unique identity of this edge.
   */
  public readonly id: number;

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
    // Assign a unique ID and increment the counter for the next edge.
    this.id = GraphEdge.nextId++;
  }
}
