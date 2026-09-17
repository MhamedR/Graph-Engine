import {DirectedGraph} from '../graph/directed-graph.js';
import {Node} from '../graph/node.js';
import {Queue} from '../data-structures/queue.js';

/**
 * Produces a topological ordering of a directed acyclic graph.
 *
 * A topological ordering places every node before the nodes that depend
 * on it.
 *
 * For example:
 *
 *     A ───► B ───► D
 *     │      │
 *     │      ▼
 *     └────► C ───► D
 *
 * A valid ordering is:
 *
 *     A → B → C → D
 *
 * Topological sorting is only possible for a directed acyclic graph.
 * If the graph contains a cycle, no valid ordering exists.
 *
 * This implementation uses Kahn's algorithm.
 *
 * The algorithm works by:
 *
 * 1. Finding nodes with no incoming edges.
 * 2. Putting those nodes into a FIFO queue.
 * 3. Removing one node from the queue.
 * 4. Reducing the incoming-edge count of its neighbors.
 * 5. Adding neighbors whose incoming-edge count reaches zero.
 * 6. Repeating until all nodes have been processed.
 *
 * @param graph - The directed graph to sort.
 * @returns The nodes in topological order.
 * @throws {Error} If the graph contains a cycle.
 */
export function topologicalSort<T>(graph: DirectedGraph<T>): Node<T>[] {
  // Store the number of remaining incoming edges for every node.
  const inDegree = new Map<string, number>();

  // Initialize each node with its current incoming-edge count.
  for (const node of graph.getNodes()) {
    inDegree.set(node.id, graph.getInDegree(node.id));
  }

  // Kahn's algorithm needs a FIFO queue of nodes whose dependencies
  // have already been satisfied.
  const queue = new Queue<Node<T>>();

  // Nodes with zero incoming edges have no dependencies and can be
  // processed immediately.
  for (const node of graph.getNodes()) {
    if (inDegree.get(node.id) === 0) {
      queue.enqueue(node);
    }
  }

  // Store nodes in the order in which they are processed.
  const result: Node<T>[] = [];

  // Continue until there are no dependency-free nodes remaining.
  while (!queue.isEmpty()) {
    const current = queue.dequeue()!;

    // The current node belongs in the topological ordering.
    result.push(current);

    // Pretend that the current node has been removed from the graph.
    // Every outgoing neighbor therefore loses one dependency.
    for (const neighbor of graph.getOutgoing(current.id)) {
      const remainingDependencies = inDegree.get(neighbor.id)! - 1;

      inDegree.set(neighbor.id, remainingDependencies);

      // Once all dependencies have been processed, this node can
      // safely enter the queue.
      if (remainingDependencies === 0) {
        queue.enqueue(neighbor);
      }
    }
  }

  // If some nodes were never processed, they must belong to a cycle.
  if (result.length !== graph.getNodes().length) {
    throw new Error('Cannot perform topological sort: graph contains a cycle.');
  }

  return result;
}
