# Public API

Graph Engine is ESM-only and supports Node.js 20 and newer. Public APIs are
available through four package entry points.

## `graph-engine`

The package root combines the stable graph and reactive application APIs. It
does not export low-level reactive graph primitives.

## `graph-engine/graph`

### Classes

- `Node<T>` — a string ID and typed payload. The payload may be omitted only
  when `T` is `string`.
- `GraphEdge` — a graph-owned directed relationship returned by `getEdge`.
- `DirectedGraph<T>` — mutable directed graph with mirrored incoming and
  outgoing adjacency indexes.

### Algorithms

- `breadthFirstSearch`
- `depthFirstSearch`
- `getAncestors`
- `getDescendants`
- `getReachableNodes`
- `hasCycle`
- `hasPath`
- `stronglyConnectedComponents`
- `topologicalSort`

Algorithms return `Node<T>` instances and throw when a required node ID is
missing. Topological sorting throws for cyclic graphs.

## `graph-engine/reactive`

### Application classes

- `ReactiveRuntime` — owns node identity, scheduling, batching, inspection,
  and lifecycle.
- `ReactiveValue<T>` — writable source with configurable equality.
- `ReactiveComputed<T>` — lazy cached computation with dynamic dependencies.
- `ReactiveEffect` — scheduled side effect with dynamic dependencies.
- `ReactiveScheduler` — deterministic FIFO scheduler.
- `ManualEffectScheduler` — manually flushed scheduler for adapters and tests.

### Extension contracts

- `ReactiveEffectScheduler`
- `ReactiveEffectScheduleHandle`

### Diagnostics

- `ReactiveRuntime.inspect()`
- `ReactiveRuntime.createGraphSnapshot()`
- `ReactiveRuntime.getGraphMetrics()`
- `ReactiveRuntime.describe()`
- `diffReactiveGraphSnapshots()`

Diagnostic snapshots are detached values intended for debugging rather than
hot-path execution.

## `graph-engine/advanced`

The advanced entry point contains low-level reactive graph primitives:

- `ReactiveNode`
- `ReactiveLink`
- `ReactiveContext`
- `Epoch`

Use this subpath only when implementing adapters or runtime extensions. Its
surface is explicit and contract-tested, but changes require more care than
the application API.

## Reactive constraints

- Node IDs are unique within one runtime.
- Dependencies cannot cross runtime boundaries.
- Evaluation and dependency tracking are synchronous.
- Computed evaluation is limited to 1,000 nested computeds.
- Effects run only through `run()` or their configured scheduler.
- Disposing a runtime disposes registered values, computeds, effects, custom
  scheduled work, and pending node changes.
