# graph-engine

A dependency-free, ESM-only TypeScript library for directed graph analysis and
deterministic push/pull reactivity.

## Requirements

- Node.js 20 or newer
- An ESM project or ESM-aware bundler

## Install

```bash
npm install graph-engine
```

## Directed graphs

```ts
import {DirectedGraph, Node, hasPath, topologicalSort} from 'graph-engine/graph';

const graph = new DirectedGraph<{label: string}>();
graph.addNode(new Node('build', {label: 'Build'}));
graph.addNode(new Node('deploy', {label: 'Deploy'}));
graph.addEdge('build', 'deploy');

hasPath(graph, 'build', 'deploy'); // true
topologicalSort(graph).map((node) => node.id); // ['build', 'deploy']
```

The graph uses incoming and outgoing adjacency indexes. It includes iterative
BFS/DFS, reachability, ancestors, descendants, cycle detection, topological
sorting, and strongly connected components.

## Reactivity

```ts
import {
  ReactiveComputed,
  ReactiveEffect,
  ReactiveRuntime,
  ReactiveValue,
} from 'graph-engine/reactive';

const runtime = new ReactiveRuntime();
const count = new ReactiveValue(runtime, 'count', 1);
const doubled = new ReactiveComputed(runtime, 'doubled', () => count.value * 2);
const observed: number[] = [];
const effect = new ReactiveEffect(runtime, 'observe', () => {
  observed.push(doubled.value);
});

effect.run();
count.value = 2;
runtime.flush();

observed; // [2, 4]
```

Values push invalidation through the dependency graph. Computeds pull and
cache their values lazily. Effects are scheduled deterministically and execute
when their scheduler is flushed.

## Entry points

- `graph-engine` — application graph and reactive APIs
- `graph-engine/graph` — graph-only API
- `graph-engine/reactive` — reactive-only API
- `graph-engine/advanced` — low-level reactive graph primitives for adapters

The advanced subpath is not needed by ordinary applications.

## Lifecycle and constraints

- Reactive node IDs must be unique within one runtime.
- Dependencies cannot cross runtime boundaries.
- Runtime and primitive disposal are idempotent.
- Computed evaluation is synchronous and limited to 1,000 nested computeds.
- The package does not provide async tracking across `await`.

## Development

The repository README contains architecture details, scripts, benchmarks, and
the complete behavioral contract.

## License

ISC
