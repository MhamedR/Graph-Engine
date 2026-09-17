import {DirectedGraph} from '../graph/directed-graph.js';

/**
 * Determines whether a directed graph contains a cycle.
 *
 * A cycle exists when there is a directed path that eventually returns
 * to a node that is already part of the current traversal path.
 *
 * For example:
 *
 *     A ───► B
 *     ▲      │
 *     │      ▼
 *     └──────C
 *
 * contains the cycle:
 *
 *     A → B → C → A
 *
 * This implementation uses depth-first search with two sets:
 *
 * - `visited` tracks nodes that have already been completely explored.
 * - `recursionStack` tracks nodes belonging to the current DFS path.
 *
 * Encountering a node already in `recursionStack` means that we found
 * a back edge, which proves that a cycle exists.
 *
 * @param graph - The directed graph to inspect.
 * @returns `true` if the graph contains at least one directed cycle.
 */
export function hasCycle<T>(graph: DirectedGraph<T>): boolean {
  // Nodes that have already been fully explored.
  const visited = new Set<string>();

  // Nodes that belong to the current DFS recursion path.
  //
  // This is different from `visited`.
  //
  // A previously visited node is not necessarily part of the current
  // path, so we need a separate set to detect back edges.
  const recursionStack = new Set<string>();

  /**
   * Performs DFS starting from a single node.
   *
   * @param nodeId - ID of the node currently being explored.
   * @returns `true` when a cycle is discovered from this node.
   */
  function visit(nodeId: string): boolean {
    // If the node is already in the current DFS path, we have returned
    // to an ancestor and therefore discovered a cycle.
    if (recursionStack.has(nodeId)) {
      return true;
    }

    // If the node has already been completely explored, there is no need
    // to traverse it again.
    if (visited.has(nodeId)) {
      return false;
    }

    // Mark the node as part of the current DFS path.
    recursionStack.add(nodeId);

    // Explore every outgoing neighbor.
    for (const neighbor of graph.getOutgoing(nodeId)) {
      // If any descendant contains a cycle, the whole traversal contains
      // a cycle, so we can stop immediately.
      if (visit(neighbor.id)) {
        return true;
      }
    }

    // We are finished exploring this node, so it is no longer part of
    // the current recursion path.
    recursionStack.delete(nodeId);

    // Mark the node as completely explored.
    visited.add(nodeId);

    // No cycle was found through this node.
    return false;
  }

  // The graph may contain multiple disconnected components, so we must
  // start DFS from every node that has not already been explored.
  for (const node of graph.getNodes()) {
    if (visited.has(node.id)) {
      continue;
    }

    // Stop as soon as a cycle is discovered.
    if (visit(node.id)) {
      return true;
    }
  }

  // Every connected component was explored without finding a cycle.
  return false;
}
