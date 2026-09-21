import {DirectedGraph} from '../directed-graph.js';
import {Node} from '../node.js';

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
 * The traversal is iterative. An explicit stack replaces recursive calls so
 * a deep graph cannot overflow the JavaScript call stack.
 *
 * Neighbors are pushed in reverse adjacency order so the first outgoing
 * neighbor is explored first, matching a left-to-right recursive DFS.
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

  // Explicit LIFO stack. Array.pop() is O(1), so this is the iterative
  // equivalent of a recursive call stack.
  const stack: Node<T>[] = [startNode];

  while (stack.length > 0) {
    const node = stack.pop()!;

    // If this node has already been visited, skip it.
    //
    // This protects us from cycles and duplicate paths.
    if (visited.has(node.id)) {
      continue;
    }

    // Mark the node as visited before exploring its neighbors.
    visited.add(node.id);

    // Record the node in traversal order.
    result.push(node);

    const neighbors = graph.getOutgoing(node.id);

    // Push neighbors from last to first so the first adjacency is popped
    // next. That preserves the same preorder as a recursive DFS.
    for (let index = neighbors.length - 1; index >= 0; index--) {
      const neighbor = neighbors[index]!;

      if (!visited.has(neighbor.id)) {
        stack.push(neighbor);
      }
    }
  }

  return result;
}
