import {DirectedGraph} from '../graph/directed-graph.js';
import {Node} from '../graph/node.js';

/**
 * Performs a depth-first traversal of a directed graph.
 *
 * DFS explores one path as deeply as possible before backtracking and
 * exploring another path.
 *
 * For example:
 *
 *     A ───► B ───► D
 *     │
 *     └────► C ───► E
 *
 * Starting at A, one possible DFS order is:
 *
 *     A → B → D → C → E
 *
 * A Set is used to track visited nodes. This prevents cycles from causing
 * the traversal to visit the same node indefinitely.
 *
 * @param graph - The directed graph to traverse.
 * @param startId - ID of the node where traversal should begin.
 * @returns The nodes visited in depth-first order.
 * @throws {Error} If the starting node does not exist.
 */
export function depthFirstSearch<T>(graph: DirectedGraph<T>, startId: string): Node<T>[] {
  // Verify that the requested starting node exists.
  const startNode = graph.getNode(startId);

  if (!startNode) {
    throw new Error(`Node "${startId}" does not exist.`);
  }

  // Keep track of nodes that have already been visited.
  //
  // This is essential for graphs containing cycles such as:
  //
  //     A → B → C
  //     ↑       │
  //     └───────┘
  const visited = new Set<string>();

  // Store the nodes in the order in which DFS visits them.
  const result: Node<T>[] = [];

  /**
   * Recursively explores the graph from a single node.
   *
   * The recursive call creates the "depth-first" behavior:
   * we completely explore one neighbor before moving to the next.
   *
   * @param node - The node currently being explored.
   */
  function visit(node: Node<T>): void {
    // If this node has already been visited, stop here.
    //
    // This protects us from cycles and duplicate paths.
    if (visited.has(node.id)) {
      return;
    }

    // Mark the node as visited before exploring its neighbors.
    visited.add(node.id);

    // Record the node in traversal order.
    result.push(node);

    // Explore each outgoing neighbor recursively.
    for (const neighbor of graph.getOutgoing(node.id)) {
      visit(neighbor);
    }
  }

  // Start the recursive traversal from the requested node.
  visit(startNode);

  // Return the complete DFS traversal order.
  return result;
}
