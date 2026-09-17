/**
 * Finds the strongly connected components of a directed graph.
 *
 * Kosaraju's algorithm performs two depth-first traversals:
 *
 * 1. Traverse the original graph and record nodes by completion order.
 * 2. Traverse the graph in reverse completion order using reversed edges.
 *
 * Each traversal of the reversed graph produces one strongly connected
 * component.
 *
 * Both DFS passes are iterative. Explicit stacks replace recursive calls
 * so a deep graph cannot overflow the JavaScript call stack.
 */

import {DirectedGraph} from './directed-graph.js';
import {Node} from './node.js';

/**
 * Finds all strongly connected components in a directed graph.
 *
 * @param graph - Directed graph to analyze.
 * @returns Groups of nodes where every node can reach every other node.
 */
export function stronglyConnectedComponents<T>(graph: DirectedGraph<T>): Node<T>[][] {
  const visited = new Set<string>();
  const finishOrder: Node<T>[] = [];

  // First pass: iterative DFS that records each node after its descendants
  // have finished. That produces the finishing times Kosaraju needs.
  for (const start of graph.getNodes()) {
    if (visited.has(start.id)) {
      continue;
    }

    const stack: Array<{node: Node<T>; expanded: boolean}> = [{node: start, expanded: false}];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;

      if (!frame.expanded) {
        if (visited.has(frame.node.id)) {
          stack.pop();
          continue;
        }

        visited.add(frame.node.id);
        frame.expanded = true;

        const neighbors = graph.getOutgoing(frame.node.id);

        // Push neighbors in reverse so the first adjacency is explored
        // first, matching a left-to-right recursive DFS.
        for (let index = neighbors.length - 1; index >= 0; index--) {
          const neighbor = neighbors[index]!;

          if (!visited.has(neighbor.id)) {
            stack.push({node: neighbor, expanded: false});
          }
        }

        continue;
      }

      stack.pop();
      finishOrder.push(frame.node);
    }
  }

  // Build the reversed adjacency relation.
  const reversed = new Map<string, Node<T>[]>();

  // Initialize an empty reversed adjacency list for every node.
  for (const node of graph.getNodes()) {
    reversed.set(node.id, []);
  }

  // Reverse every directed relationship.
  //
  // `getOutgoing()` already returns the destination Node<T>, so there is
  // no `edge.to` property to access here.
  for (const node of graph.getNodes()) {
    for (const nextNode of graph.getOutgoing(node.id)) {
      reversed.get(nextNode.id)?.push(node);
    }
  }

  // Reset visitation state for the second DFS pass.
  visited.clear();

  const components: Node<T>[][] = [];

  // Second pass: iterative DFS over reversed edges, processing nodes in
  // reverse finishing order. Each traversal collects one component.
  for (const node of [...finishOrder].reverse()) {
    if (visited.has(node.id)) {
      continue;
    }

    const component: Node<T>[] = [];
    const stack: Node<T>[] = [node];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);
      component.push(current);

      const previousNodes = reversed.get(current.id) ?? [];

      for (let index = previousNodes.length - 1; index >= 0; index--) {
        const previous = previousNodes[index]!;

        if (!visited.has(previous.id)) {
          stack.push(previous);
        }
      }
    }

    components.push(component);
  }

  return components;
}
