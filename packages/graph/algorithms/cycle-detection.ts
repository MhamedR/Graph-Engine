import {DirectedGraph} from '../directed-graph.js';

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
 * This implementation uses iterative depth-first search with two sets:
 *
 * - `visited` tracks nodes that have already been completely explored.
 * - `onPath` tracks nodes belonging to the current DFS path.
 *
 * Encountering a node already in `onPath` means that we found a back edge,
 * which proves that a cycle exists.
 *
 * Each stack frame is either opening a node or closing it after its
 * descendants have been processed. That replaces recursive enter/leave
 * without depending on the JavaScript call stack.
 *
 * @param graph - The directed graph to inspect.
 * @returns `true` if the graph contains at least one directed cycle.
 */
export function hasCycle<T>(graph: DirectedGraph<T>): boolean {
  // Nodes that have already been fully explored.
  const visited = new Set<string>();

  // Nodes that belong to the current DFS path.
  //
  // This is different from `visited`.
  //
  // A previously visited node is not necessarily part of the current
  // path, so we need a separate set to detect back edges.
  const onPath = new Set<string>();

  // The graph may contain multiple disconnected components, so we must
  // start DFS from every node that has not already been explored.
  for (const start of graph.getNodes()) {
    if (visited.has(start.id)) {
      continue;
    }

    const stack: Array<{id: string; open: boolean}> = [{id: start.id, open: true}];

    while (stack.length > 0) {
      const frame = stack.pop()!;

      // Closing a frame means this node has no remaining descendants on
      // the current path, so it can leave the path and become visited.
      if (!frame.open) {
        onPath.delete(frame.id);
        visited.add(frame.id);
        continue;
      }

      // Opening a node that is already on the current path is a back edge.
      if (onPath.has(frame.id)) {
        return true;
      }

      // A finished node cannot participate in a new cycle from this path.
      if (visited.has(frame.id)) {
        continue;
      }

      // Mark the node as part of the current DFS path, then schedule a
      // close frame so it is removed after its descendants.
      onPath.add(frame.id);
      stack.push({id: frame.id, open: false});

      const neighbors = graph.getOutgoing(frame.id);

      for (let index = neighbors.length - 1; index >= 0; index--) {
        const neighborId = neighbors[index]!.id;

        // A neighbor still on the current path is a back edge.
        if (onPath.has(neighborId)) {
          return true;
        }

        if (!visited.has(neighborId)) {
          stack.push({id: neighborId, open: true});
        }
      }
    }
  }

  // Every connected component was explored without finding a cycle.
  return false;
}
