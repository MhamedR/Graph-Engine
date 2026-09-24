# Graphora

A dependency-free, ESM-only TypeScript library for directed graph analysis and
deterministic push/pull reactivity.

## Requirements

- Node.js 20 or newer
- An ESM project or ESM-aware bundler

## Install

```bash
npm install graphora
```

## Directed graphs

```ts
import {DirectedGraph, Node, hasPath, topologicalSort} from 'graphora/graph';

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
import {ReactiveComputed, ReactiveEffect, ReactiveRuntime, ReactiveValue} from 'graphora/reactive';

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

### Explain invalidations

```ts
const tracedRuntime = new ReactiveRuntime({traceBufferSize: 128});

tracedRuntime.subscribe((event) => {
  console.log(event.type, event.sequence);
});

tracedRuntime.explain('some-computed').invalidation?.path;
tracedRuntime.getTrace({sinceSequence: 0, limit: 25});
```

Tracing is bounded and opt-in. `explain()` returns the most recent causal
source-to-node invalidation path even when event retention is disabled.
Snapshots include node kinds, and snapshot diffs report changed edge state.

For asynchronous scheduled work, use `AsyncReactiveScheduler`. The synchronous
schedulers reject promise-returning tasks so a flush cannot complete while
work is still unsettled.

## Entry points

- `graphora` — application graph and reactive APIs
- `graphora/graph` — graph-only API
- `graphora/reactive` — reactive-only API
- `graphora/advanced` — low-level reactive graph primitives for adapters
- `graphora/store` — `useSyncExternalStore`-compatible stores for React,
  Vue, Svelte, and Solid
- `graphora/opentelemetry` — batches and computations as OpenTelemetry spans
- `graphora/inspector` — read-only inspection tools, ready for MCP servers
- `graphora/devtools` — transport-agnostic devtools message bridge

The advanced subpath is not needed by ordinary applications. Integrations have
no runtime dependencies; bring your own React, tracer, or MCP SDK.

## Integrations

```ts
import {useSyncExternalStore} from 'react';
import {createExternalStore, createMicrotaskScheduler} from 'graphora/store';

const doubledStore = createExternalStore(runtime, doubled, {
  scheduler: createMicrotaskScheduler(),
});

function Doubled() {
  return <>{useSyncExternalStore(doubledStore.subscribe, doubledStore.getSnapshot)}</>;
}
```

Plugins extend a runtime with `runtime.use(plugin)`. OpenTelemetry export,
MCP servers, devtools, and framework recipes are documented in the repository's
`docs/RECIPES.md`.

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
