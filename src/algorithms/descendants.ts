import {DirectedGraph} from '../graph/directed-graph.js';
import {Node} from '../graph/node.js';
import {Queue} from '../data-structures/queue.js';

/**
 * Returns every node that can be reached from the given node.
 *
 * A descendant is a node that can be reached by following one or more
 * directed edges away from the starting node.
 *
 * For example:
 *
 *     A ───► B ───► C
 *     │
 *     └────► D
 *
 * The descendants of A are:
 *
 *     B, C, D
 *
 * The starting node itself is intentionally excluded.
 *
 * This traversal follows outgoing edges, allowing us to walk forward
 * through the graph.
 *
 * @param graph - The directed graph to search.
 * @param startId - ID of the node whose descendants should be found.
 * @returns All nodes reachable from the starting node.
 * @throws {Error} If the starting node does not exist.
 */
export function getDescendants<T>(graph: DirectedGraph<T>, startId: string): Node<T>[] {
  // Make sure the starting node exists before beginning the traversal.
  const startNode = graph.getNode(startId);

  if (!startNode) {
    throw new Error(`Node "${startId}" does not exist.`);
  }

  // Use our reusable FIFO queue instead of Array.shift().
  const queue = new Queue<Node<T>>();

  // Track visited nodes so cycles cannot cause infinite traversal.
  const visited = new Set<string>([startId]);

  // Store descendants in the order in which they are discovered.
  const result: Node<T>[] = [];

  // The traversal starts at the requested node.
  queue.enqueue(startNode);

  // Continue until there are no more nodes to explore.
  while (!queue.isEmpty()) {
    // dequeue() is safe because the loop guarantees an available item.
    const current = queue.dequeue()!;

    // Follow outgoing edges to discover downstream nodes.
    for (const descendant of graph.getOutgoing(current.id)) {
      // Ignore nodes that have already been discovered.
      if (visited.has(descendant.id)) {
        continue;
      }

      // Mark the node before adding it to the queue.
      visited.add(descendant.id);

      // Record the discovered descendant.
      result.push(descendant);

      // Continue traversing from this descendant.
      queue.enqueue(descendant);
    }
  }

  return result;
}
