import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';

/**
 * Produces a topological ordering of a directed acyclic graph.
 *
 * A topological ordering places every node before the nodes that depend
 * on it.
 *
 * For example:
 *
 *     A ───► B ───► D
 *     │
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
 * 2. Removing those nodes from the remaining dependency graph.
 * 3. Repeating the process until all nodes have been processed.
 *
 * @param graph - The directed graph to sort.
 * @returns The nodes in topological order.
 * @throws {Error} If the graph contains a cycle.
 */
export function topologicalSort(graph: DirectedGraph): GraphNode[] {
  // Store the number of incoming edges for every node.
  //
  // We copy these values instead of modifying the graph itself because
  // an algorithm should not change the caller's graph.
  const inDegree = new Map<string, number>();

  // Initialize the in-degree of every node.
  for (const node of graph.getNodes()) {
    inDegree.set(node.id, graph.getInDegree(node.id));
  }

  // Nodes with zero incoming edges have no dependencies and can therefore
  // be processed immediately.
  const queue: GraphNode[] = [];

  for (const node of graph.getNodes()) {
    if (inDegree.get(node.id) === 0) {
      queue.push(node);
    }
  }

  // Store the final topological ordering.
  const result: GraphNode[] = [];

  // Process nodes whose dependencies have already been satisfied.
  while (queue.length > 0) {
    // Remove the next dependency-free node.
    const current = queue.shift()!;

    // Add it to the final ordering.
    result.push(current);

    // Removing `current` conceptually removes all of its outgoing edges.
    for (const neighbor of graph.getOutgoing(current.id)) {
      // Reduce the neighbor's remaining dependency count.
      const remainingDependencies = inDegree.get(neighbor.id)! - 1;

      // Store the updated dependency count.
      inDegree.set(neighbor.id, remainingDependencies);

      // Once a node has no remaining dependencies, it can be processed.
      if (remainingDependencies === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If we could not process every node, some nodes must still depend on
  // each other. That can only happen when the graph contains a cycle.
  if (result.length !== graph.getNodes().length) {
    throw new Error('Cannot perform topological sort: graph contains a cycle.');
  }

  // Return the dependency-respecting ordering.
  return result;
}
