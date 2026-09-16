# Graph Engine

A framework-agnostic TypeScript library with two related subsystems:

- a directed graph with traversal and analysis algorithms
- a push/pull reactive runtime (values, computeds, effects, batching, scheduling)

The package is ESM-only. The core has no runtime dependencies.

```ts
import {
  DirectedGraph,
  GraphNode,
  ReactiveComputed,
  ReactiveEffect,
  ReactiveRuntime,
  ReactiveValue,
} from 'graph-engine';
```

Subpath imports are also published:

```ts
import {DirectedGraph} from 'graph-engine/graph';
import {ReactiveRuntime} from 'graph-engine/reactive';
```

## Graph

`DirectedGraph` stores nodes by ID and directed edges in bidirectional adjacency maps. Duplicate edges are ignored. Missing-node queries throw. Structural mutations advance `graph.version`.

```ts
const graph = new DirectedGraph();
graph.addNode(new GraphNode('a'));
graph.addNode(new GraphNode('b'));
graph.addNode(new GraphNode('c'));
graph.addEdge('a', 'b');
graph.addEdge('b', 'c');

graph.hasEdge('a', 'b'); // true
graph.getEdge('a', 'b')?.id; // 0
graph.getOutgoing('a').map((node) => node.id); // ['b']
```

Algorithms operate on the public graph API:

| Function                                  | Behavior                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `breadthFirstSearch` / `depthFirstSearch` | Traversal from a start node                                                        |
| `hasPath` / `getReachableNodes`           | Directed reachability (`hasPath(a, a)` is true; reachable nodes exclude the start) |
| `getAncestors` / `getDescendants`         | Upstream / downstream nodes                                                        |
| `hasCycle`                                | Directed cycle detection                                                           |
| `topologicalSort`                         | Kahn sort; throws if the graph contains a cycle                                    |
| `stronglyConnectedComponents`             | Kosaraju components                                                                |

`GraphEdge` is exported for compatibility. `getEdge(from, to)` returns the shared edge object; other query methods return `GraphNode` instances. Edge IDs are assigned per graph, starting at `0`.

### Graph complexity

| Operation                                        | Complexity |
| ------------------------------------------------ | ---------- |
| `addNode`                                        | O(1)       |
| `hasEdge` / `getEdge` / `addEdge` / `removeEdge` | O(1)       |
| `getOutDegree` / `getInDegree`                   | O(1)       |
| `getOutgoing` / `getIncoming`                    | O(degree)  |
| `removeNode`                                     | O(degree)  |
| BFS / descendants / ancestors                    | O(n + e)   |

## Reactivity

A `ReactiveRuntime` owns epoch, dependency tracking, scheduling, batching, and disposal.

```ts
const runtime = new ReactiveRuntime();
const count = new ReactiveValue(runtime, 'count', 1);
const doubled = new ReactiveComputed(runtime, 'doubled', () => count.value * 2);

const seen: number[] = [];
const effect = new ReactiveEffect(runtime, 'log', () => {
  seen.push(doubled.value);
});

effect.run(); // seen === [2]
count.value = 5;
runtime.flush(); // seen === [2, 10]
```

### Evaluation model

- **Values** are writable sources. Same-value writes (`Object.is` by default) do not invalidate.
- **Computeds** are lazy and cached. They rebuild dependencies on each run, so unused branches are dropped.
- **Effects** do not run until `run()` or a scheduled flush. Invalidation schedules the effect; `runtime.flush()` executes it.
- **Push then pull:** a write dirties descendants immediately; computeds recompute only when read.

### Lifecycle

`dispose()` is idempotent.

- Disposing a value or computed invalidates consumers, then disconnects the node.
- Reading or writing a disposed value/computed throws. The failed read does not register a new dependency.
- `runtime.dispose()` disposes registered nodes and rejects later registration, scheduling, batching, and deferred work.

### Batching and scheduling

`runtime.batch()` may nest. Effect scheduling is deferred until the outermost batch completes, so several writes produce one effect run.

`ReactiveScheduler.flush()` runs the current queue as one batch. Tasks scheduled during flush wait for the next flush. If a task throws, later tasks in the same batch still run; the first error is rethrown afterward. `flushOne()` fails immediately and leaves remaining work queued.

`ManualEffectScheduler` is a deterministic alternative with the same continue-then-rethrow flush contract.

### Errors

| Failure                       | Contract                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Computed/effect throws        | Error propagates; previous computed cache is kept; the node stays invalid until a later successful run |
| Computed cycle / self-read    | `Reactive computed "id" cannot read itself while computing.`                                           |
| Recursive `effect.run()`      | `Reactive effect "id" cannot run itself recursively.`                                                  |
| Recursive `scheduler.flush()` | `Reactive scheduler cannot be flushed recursively.`                                                    |
| Missing graph node            | `Node "id" does not exist.`                                                                            |
| Cyclic topological sort       | `Cannot perform topological sort: graph contains a cycle.`                                             |

## Advanced API

These remain exported for compatibility, but application code should rarely use them directly:

- `ReactiveNode`, `ReactiveLink`, `ReactiveContext`, `Epoch`
- `GraphEdge`

Diagnostics (`inspect()`, `createGraphSnapshot()`, `toDot()`) are for debugging, not the hot path.

## Scripts

```bash
npm test          # correctness suite in test/, mirroring src/
npm run typecheck
npm run build     # production emit, tests excluded
npm run ci        # typecheck + test + build
npm run bench     # local performance baseline
```

CI runs `npm run ci` on `main` and pull requests.

## License

ISC
